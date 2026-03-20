document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('input-text');
    const cribText = document.getElementById('crib-text');
    const btnAllDecodes = document.getElementById('btn-all-decodes');
    const btnMagic = document.getElementById('btn-magic');
    const btnClear = document.getElementById('btn-clear');
    const outputContainer = document.getElementById('output-container');
    const visualizerPanel = document.getElementById('visualizer-panel');
    const visualizerStats = document.getElementById('visualizer-stats');
    const visualizerBranchList = document.getElementById('visualizer-branch-list');
    const visualizerSelectionMeta = document.getElementById('visualizer-selection-meta');
    const visualizerSelectionPath = document.getElementById('visualizer-selection-path');
    const visualizerViewport = document.getElementById('visualizer-viewport');
    const visualizerSvg = document.getElementById('visualizer-svg');
    const visualizerGraph = document.getElementById('visualizer-graph');
    const visualizerCloseBtn = document.getElementById('visualizer-close-btn');
    const visSearchCribInput = document.getElementById('vis-search-crib');
    const visSearchBtn = document.getElementById('vis-search-btn');
    const visSearchNextBtn = document.getElementById('vis-search-next-btn');
    const visSearchClearBtn = document.getElementById('vis-search-clear-btn');
    const tabOutput = document.getElementById('tab-output');
    const tabVisualizer = document.getElementById('tab-visualizer');
    const statusIndicator = document.getElementById('status-indicator');
    if (statusIndicator) statusIndicator.setAttribute('aria-live', 'polite');
    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const magicDepthInput = document.getElementById('magic-depth');
    const initialSequenceTrigger = document.getElementById('initial-sequence-trigger');
    const initialSequenceCount = document.getElementById('initial-sequence-count');
    const initialSequenceLength = document.getElementById('initial-sequence-length');
    const sequenceBuilder = document.getElementById('sequence-builder');
    const initialSequenceSelected = document.getElementById('initial-sequence-selected');
    const initialSequenceAvailable = document.getElementById('initial-sequence-available');
    const initialSequenceClearBtn = document.getElementById('initial-sequence-clear');
    const crazyModeToggle = document.getElementById('crazy-mode-toggle');
    const operationsToggles = document.getElementById('operations-toggles');
    const resultTemplate = document.getElementById('result-card-template');

    const CRIB_MATCH_SCORE = window.Decoder.CRIB_MATCH_SCORE; // Fix #1
    let activeResultsTab = 'output';
    let visualizerOverlayOpen = false;
    let runVisualizerSearch = null;
    const visState = {
        scale: 1,
        tx: 0,
        ty: 0,
        dragging: false,
        dragStartX: 0,
        dragStartY: 0,
        baseTx: 0,
        baseTy: 0,
        initialized: false,
        minScale: 0.15,
        maxScale: 24,
        panSpeed: 2.35,
        defaultPanSpeed: 2.35,
        rafPending: false
    };

    // Color cache for performance
    const colorCache = new Map();
    let initialSequenceOps = [];
    let initialSequencePopoverOpen = false;

    const visRuntime = {
        branches: [],
        filteredBranches: [],
        branchElById: new Map(),
        treeNodes: new Map(),
        childrenById: new Map(),
        parentById: new Map(),
        matches: [],
        matchIndex: -1,
        selectedBranchId: ''
    };

    function applyVisualizerTransform() {
        if (!visualizerGraph) return;
        visualizerGraph.setAttribute(
            'transform',
            `translate(${visState.tx} ${visState.ty}) scale(${visState.scale})`
        );
    }

    function scheduleVisualizerTransform() {
        if (visState.rafPending) return;
        visState.rafPending = true;
        requestAnimationFrame(() => {
            visState.rafPending = false;
            applyVisualizerTransform();
        });
    }

    function resetVisualizerTransform() {
        visState.scale = 1;
        visState.tx = 0;
        visState.ty = 0;
        applyVisualizerTransform();
    }

    function setupVisualizerInteractions() {
        if (visState.initialized || !visualizerViewport || !visualizerSvg) return;
        visState.initialized = true;

        visualizerViewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = Math.exp(-e.deltaY * 0.0018);
            const prevScale = visState.scale;
            const newScale = Math.max(visState.minScale, Math.min(visState.maxScale, prevScale * zoomFactor));
            if (newScale === prevScale) return;

            const rect = visualizerSvg.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const worldX = (px - visState.tx) / prevScale;
            const worldY = (py - visState.ty) / prevScale;

            visState.scale = newScale;
            visState.tx = px - worldX * newScale;
            visState.ty = py - worldY * newScale;
            scheduleVisualizerTransform();
        }, { passive: false });

        visualizerViewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            visState.dragging = true;
            visState.dragStartX = e.clientX;
            visState.dragStartY = e.clientY;
            visState.baseTx = visState.tx;
            visState.baseTy = visState.ty;
            visualizerViewport.classList.add('dragging');
        });

        window.addEventListener('mousemove', (e) => {
            if (!visState.dragging) return;
            const dx = e.clientX - visState.dragStartX;
            const dy = e.clientY - visState.dragStartY;
            visState.tx = visState.baseTx + (dx * visState.panSpeed);
            visState.ty = visState.baseTy + (dy * visState.panSpeed);
            scheduleVisualizerTransform();
        });

        window.addEventListener('mouseup', () => {
            if (!visState.dragging) return;
            visState.dragging = false;
            visualizerViewport.classList.remove('dragging');
            scheduleVisualizerTransform();
        });

        visualizerViewport.addEventListener('dblclick', () => {
            resetVisualizerTransform();
        });
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function buildHighlightedSnippet(text, rawQuery, maxChars = 280) {
        const fragment = document.createDocumentFragment();
        const source = String(text || '').replace(/\s+/g, ' ').trim();
        const query = String(rawQuery || '').trim();
        if (!source) {
            fragment.appendChild(document.createTextNode('[No output preview]'));
            return fragment;
        }

        if (!query) {
            const clipped = source.length > maxChars ? `${source.slice(0, maxChars - 1)}…` : source;
            fragment.appendChild(document.createTextNode(clipped));
            return fragment;
        }

        const lowerSource = source.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const matchIndex = lowerSource.indexOf(lowerQuery);
        if (matchIndex === -1) {
            const clipped = source.length > maxChars ? `${source.slice(0, maxChars - 1)}…` : source;
            fragment.appendChild(document.createTextNode(clipped));
            return fragment;
        }

        const contextBefore = Math.max(0, Math.floor((maxChars - query.length) * 0.45));
        const start = Math.max(0, matchIndex - contextBefore);
        const end = Math.min(source.length, start + maxChars);
        const prefixEllipsis = start > 0 ? '…' : '';
        const suffixEllipsis = end < source.length ? '…' : '';
        const visible = source.slice(start, end);
        const localMatchIndex = matchIndex - start;

        if (prefixEllipsis) fragment.appendChild(document.createTextNode(prefixEllipsis));
        fragment.appendChild(document.createTextNode(visible.slice(0, localMatchIndex)));
        const mark = document.createElement('mark');
        mark.className = 'visualizer-crib-match';
        mark.textContent = visible.slice(localMatchIndex, localMatchIndex + query.length);
        fragment.appendChild(mark);
        fragment.appendChild(document.createTextNode(visible.slice(localMatchIndex + query.length)));
        if (suffixEllipsis) fragment.appendChild(document.createTextNode(suffixEllipsis));
        return fragment;
    }

    function renderVisualizerSelectionPath(pathOps) {
        if (!visualizerSelectionPath) return;
        visualizerSelectionPath.innerHTML = '';
        if (!Array.isArray(pathOps) || pathOps.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'visualizer-empty';
            empty.textContent = 'No path selected.';
            visualizerSelectionPath.appendChild(empty);
            return;
        }
        for (let i = 0; i < pathOps.length; i++) {
            const chip = document.createElement('span');
            chip.className = 'visualizer-path-chip';
            chip.textContent = pathOps[i];
            visualizerSelectionPath.appendChild(chip);
        }
    }

    function renderFocusedBranchGraph(branch) {
        if (!visualizerGraph || !visualizerSvg) return;
        visualizerGraph.innerHTML = '';
        resetVisualizerTransform();

        if (!branch) {
            visualizerSvg.setAttribute('viewBox', '0 0 960 320');
            return;
        }

        const included = new Set(['root']);
        let parentId = 'root';
        for (let i = 0; i < branch.pathOps.length; i++) {
            const childId = parentId + '>' + branch.pathOps[i];
            included.add(childId);
            const siblings = visRuntime.childrenById.get(parentId) || [];
            for (let j = 0; j < siblings.length; j++) {
                included.add(siblings[j].id);
            }
            parentId = childId;
        }
        const finalChildren = visRuntime.childrenById.get(parentId) || [];
        for (let i = 0; i < finalChildren.length; i++) {
            included.add(finalChildren[i].id);
        }

        const childrenById = new Map();
        const nodeById = new Map();
        for (const id of included) {
            const node = visRuntime.treeNodes.get(id);
            if (!node) continue;
            nodeById.set(id, node);
            childrenById.set(id, []);
        }
        for (const id of included) {
            const children = visRuntime.childrenById.get(id) || [];
            const kept = [];
            for (let i = 0; i < children.length; i++) {
                if (included.has(children[i].id)) kept.push(children[i]);
            }
            kept.sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.op.localeCompare(b.op);
            });
            childrenById.set(id, kept);
        }

        const subtreeWeight = new Map();
        function measure(nodeId) {
            const children = childrenById.get(nodeId) || [];
            if (children.length === 0) {
                subtreeWeight.set(nodeId, 1);
                return 1;
            }
            let total = 0;
            for (let i = 0; i < children.length; i++) total += measure(children[i].id);
            const value = Math.max(1, total);
            subtreeWeight.set(nodeId, value);
            return value;
        }

        const totalWeight = measure('root');
        const maxDepth = Math.max(1, branch.pathOps.length);
        const width = Math.max(880, Math.ceil(totalWeight * 112 + 140));
        const height = Math.max(300, Math.ceil((maxDepth + 1) * 112 + 90));
        const marginX = 70;
        const marginTop = 42;
        const stepY = maxDepth > 0 ? ((height - marginTop - 50) / maxDepth) : 120;
        visualizerSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        visualizerSvg.setAttribute('width', String(width));
        visualizerSvg.setAttribute('height', String(height));

        const posById = new Map();
        function assign(nodeId, leftUnits, rightUnits) {
            const node = nodeById.get(nodeId);
            if (!node) return;
            const x = marginX + ((leftUnits + rightUnits) * 0.5 * 112);
            const y = marginTop + (node.depth * stepY);
            posById.set(nodeId, { x, y, node });
            const children = childrenById.get(nodeId) || [];
            let cursor = leftUnits;
            for (let i = 0; i < children.length; i++) {
                const weight = subtreeWeight.get(children[i].id) || 1;
                assign(children[i].id, cursor, cursor + weight);
                cursor += weight;
            }
        }
        assign('root', 0, totalWeight);

        const selectedIds = new Set(['root']);
        let selectedPrefix = 'root';
        for (let i = 0; i < branch.pathOps.length; i++) {
            selectedPrefix += '>' + branch.pathOps[i];
            selectedIds.add(selectedPrefix);
        }

        const svgNS = 'http://www.w3.org/2000/svg';
        for (const [parentNodeId, children] of childrenById.entries()) {
            const p1 = posById.get(parentNodeId);
            if (!p1) continue;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const p2 = posById.get(child.id);
                if (!p2) continue;
                const path = document.createElementNS(svgNS, 'path');
                const midY = p1.y + ((p2.y - p1.y) * 0.52);
                path.setAttribute('d', `M ${p1.x} ${p1.y} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y}`);
                path.setAttribute('fill', 'none');
                path.setAttribute('class', 'vis-edge');
                if (selectedIds.has(parentNodeId) && selectedIds.has(child.id)) {
                    path.classList.add('vis-edge-focus');
                }
                visualizerGraph.appendChild(path);
            }
        }

        for (const [nodeId, pos] of posById.entries()) {
            const node = pos.node;
            const radius = node.depth === 0 ? 12 : Math.max(10, Math.min(16, 9 + Math.log2(1 + node.count)));

            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', pos.x);
            circle.setAttribute('cy', pos.y);
            circle.setAttribute('r', radius);
            circle.setAttribute('fill', node.depth === 0 ? '#b8e3ff' : '#68b9ff');
            circle.setAttribute('class', 'vis-node');
            if (selectedIds.has(nodeId)) circle.classList.add('vis-node-focus');
            circle.addEventListener('mouseenter', () => {
                if (visualizerNodeInfo) {
                    const sample = (node.sample || '').replace(/\s+/g, ' ').slice(0, 160);
                    visualizerNodeInfo.textContent = `${node.pathText} | branches: ${node.count} | best score: ${(node.score || 0).toFixed(2)}${sample ? ` | sample: ${sample}` : ''}`;
                }
            });
            visualizerGraph.appendChild(circle);

            const label = document.createElementNS(svgNS, 'text');
            label.setAttribute('x', String(pos.x));
            label.setAttribute('y', String(node.depth === 0 ? pos.y - (radius + 11) : pos.y + radius + 14));
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'middle');
            label.setAttribute('class', 'vis-label');
            if (selectedIds.has(nodeId)) label.classList.add('vis-label-focus');
            label.textContent = node.depth === 0 ? 'Input' : node.op;
            visualizerGraph.appendChild(label);
        }
    }

    function selectVisualizerBranch(branchId, scrollIntoView = false) {
        const branch = visRuntime.filteredBranches.find(item => item.id === branchId)
            || visRuntime.branches.find(item => item.id === branchId)
            || null;
        visRuntime.selectedBranchId = branch ? branch.id : '';

        for (const [id, el] of visRuntime.branchElById.entries()) {
            const active = !!branch && id === branch.id;
            el.classList.toggle('active', active);
            if (active && scrollIntoView) {
                el.scrollIntoView({ block: 'nearest' });
            }
        }

        if (!branch) {
            renderVisualizerSelectionPath([]);
            renderFocusedBranchGraph(null);
            if (visualizerSelectionMeta) visualizerSelectionMeta.textContent = 'No branch selected.';
            return;
        }

        renderVisualizerSelectionPath(branch.pathOps);
        renderFocusedBranchGraph(branch);

        const branchIndex = visRuntime.filteredBranches.findIndex(item => item.id === branch.id);
        if (visualizerSelectionMeta) {
            const scoreText = typeof branch.score === 'number' ? branch.score.toFixed(2) : '0.00';
            const rankText = branchIndex >= 0 ? `Filtered rank ${branchIndex + 1} of ${visRuntime.filteredBranches.length}` : `Overall rank ${branch.rank}`;
            visualizerSelectionMeta.textContent = `${rankText} | depth ${branch.pathOps.length} | score ${scoreText}`;
        }
    }

    function renderVisualizerBranchList() {
        if (!visualizerBranchList) return;
        visualizerBranchList.innerHTML = '';
        visRuntime.branchElById.clear();

        if (!visRuntime.filteredBranches.length) {
            const empty = document.createElement('div');
            empty.className = 'visualizer-empty';
            empty.textContent = visRuntime.branches.length ? 'No branches match the current search.' : 'Run Smart Magic Search to inspect ranked branches.';
            visualizerBranchList.appendChild(empty);
            return;
        }

        const displayLimit = 250;
        const visibleBranches = visRuntime.filteredBranches.slice(0, displayLimit);
        for (let i = 0; i < visibleBranches.length; i++) {
            const branch = visibleBranches[i];
            const sequenceText = branch.pathText || '[No sequence]';
            const outputText = branch.text || '';
            const cribQuery = visSearchCribInput ? visSearchCribInput.value : '';

            const item = document.createElement('div');
            item.className = 'visualizer-branch-item';
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', `Select branch ${branch.rank}`);

            const top = document.createElement('div');
            top.className = 'visualizer-branch-top';

            const rank = document.createElement('span');
            rank.className = 'visualizer-branch-rank';
            rank.textContent = `#${branch.rank}`;
            top.appendChild(rank);

            const score = document.createElement('span');
            score.className = 'visualizer-branch-score';
            score.textContent = branch.score.toFixed(2);
            top.appendChild(score);

            const sequenceSection = document.createElement('div');
            sequenceSection.className = 'visualizer-branch-section';
            const sequenceLabel = document.createElement('div');
            sequenceLabel.className = 'visualizer-branch-label';
            sequenceLabel.textContent = 'Sequence';
            const sequenceBody = document.createElement('div');
            sequenceBody.className = 'visualizer-branch-sequence';
            sequenceBody.textContent = sequenceText;
            sequenceSection.appendChild(sequenceLabel);
            sequenceSection.appendChild(sequenceBody);

            const outputSection = document.createElement('div');
            outputSection.className = 'visualizer-branch-section';
            const outputLabel = document.createElement('div');
            outputLabel.className = 'visualizer-branch-label';
            outputLabel.textContent = 'Output';
            const outputBody = document.createElement('div');
            outputBody.className = 'visualizer-branch-preview';
            outputBody.appendChild(buildHighlightedSnippet(outputText, cribQuery));
            outputSection.appendChild(outputLabel);
            outputSection.appendChild(outputBody);

            item.appendChild(top);
            item.appendChild(sequenceSection);
            item.appendChild(outputSection);

            item.addEventListener('click', () => selectVisualizerBranch(branch.id));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectVisualizerBranch(branch.id);
                }
            });
            visualizerBranchList.appendChild(item);
            visRuntime.branchElById.set(branch.id, item);
        }

        if (visRuntime.filteredBranches.length > displayLimit) {
            const more = document.createElement('div');
            more.className = 'visualizer-list-note';
            more.textContent = `Showing top ${displayLimit} of ${visRuntime.filteredBranches.length} matching branches. Refine search to narrow further.`;
            visualizerBranchList.appendChild(more);
        }
    }

    function applyVisualizerSearch(focusFirst = true) {
        const crib = ((visSearchCribInput ? visSearchCribInput.value : '') || '').trim().toLowerCase();

        visRuntime.filteredBranches = visRuntime.branches.filter((branch) => {
            const cribOk = !crib || ((branch.text || '').toLowerCase().includes(crib));
            return cribOk;
        });
        visRuntime.matches = visRuntime.filteredBranches.slice();
        visRuntime.matchIndex = visRuntime.filteredBranches.length > 0 ? 0 : -1;

        renderVisualizerBranchList();

        const currentStillVisible = visRuntime.filteredBranches.some(item => item.id === visRuntime.selectedBranchId);
        if (focusFirst || !currentStillVisible) {
            selectVisualizerBranch(visRuntime.filteredBranches[0]?.id || '', true);
        } else {
            selectVisualizerBranch(visRuntime.selectedBranchId, false);
        }

        if (visualizerStats) {
            const total = visRuntime.branches.length;
            const filtered = visRuntime.filteredBranches.length;
            visualizerStats.textContent = `Branch Explorer: ${total} branch${total === 1 ? '' : 'es'} ranked${filtered !== total ? ` | Search: ${filtered} match(es)` : ''}.`;
        }
    }

    function jumpToNextSearchMatch() {
        if (!visRuntime.matches || visRuntime.matches.length === 0) return;
        visRuntime.matchIndex = (visRuntime.matchIndex + 1) % visRuntime.matches.length;
        const branch = visRuntime.matches[visRuntime.matchIndex];
        selectVisualizerBranch(branch.id, true);
    }

    if (visSearchBtn) visSearchBtn.addEventListener('click', () => applyVisualizerSearch(true));
    if (visSearchNextBtn) visSearchNextBtn.addEventListener('click', jumpToNextSearchMatch);
    if (visSearchClearBtn) {
        visSearchClearBtn.addEventListener('click', () => {
            if (visSearchCribInput) visSearchCribInput.value = '';
            applyVisualizerSearch(true);
        });
    }
    if (visSearchCribInput) {
        visSearchCribInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyVisualizerSearch(true);
        });
    }

    runVisualizerSearch = applyVisualizerSearch;

    function setResultsTab(tabName) {
        activeResultsTab = tabName;
        const showVisualizer = false;
        if (outputContainer) outputContainer.classList.toggle('hidden', false);
        if (visualizerPanel) visualizerPanel.classList.toggle('hidden', !visualizerOverlayOpen);
        if (tabOutput) {
            tabOutput.classList.toggle('active', !visualizerOverlayOpen);
            tabOutput.setAttribute('aria-selected', String(!visualizerOverlayOpen));
        }
        if (tabVisualizer) {
            tabVisualizer.classList.toggle('active', visualizerOverlayOpen);
            tabVisualizer.setAttribute('aria-selected', String(visualizerOverlayOpen));
        }
    }

    if (tabOutput) tabOutput.addEventListener('click', () => setResultsTab('output'));

    function openVisualizerOverlay() {
        if (!visRuntime.branches.length) {
            if (statusIndicator) {
                statusIndicator.textContent = 'Run Smart Magic Search first to open the visualizer.';
                statusIndicator.className = 'status-indicator error';
            }
            return;
        }
        visualizerOverlayOpen = true;
        document.body.classList.add('visualizer-popout-open');
        if (visualizerPanel) visualizerPanel.classList.remove('hidden');
        setResultsTab('output');
    }

    function closeVisualizerOverlay() {
        visualizerOverlayOpen = false;
        document.body.classList.remove('visualizer-popout-open');
        if (visualizerPanel) visualizerPanel.classList.add('hidden');
        setResultsTab('output');
    }

    if (tabVisualizer) {
        tabVisualizer.addEventListener('click', () => {
            openVisualizerOverlay();
        });
    }
    if (visualizerCloseBtn) visualizerCloseBtn.addEventListener('click', closeVisualizerOverlay);
    if (visualizerPanel) {
        visualizerPanel.addEventListener('click', (e) => {
            if (e.target === visualizerPanel) closeVisualizerOverlay();
        });
    }

    function materializePathFromResult(res) {
        if (res.path && Array.isArray(res.path)) return res.path;
        if (!res.pathNode) return [];
        const arr = [];
        let curr = res.pathNode;
        while (curr) {
            arr.unshift(curr.op);
            curr = curr.prev;
        }
        return arr;
    }

    function colorForOp(opName) {
        if (!opName || opName === 'Input') return '#8b949e';
        if (colorCache.has(opName)) return colorCache.get(opName);
        let hash = 0;
        for (let i = 0; i < opName.length; i++) {
            hash = ((hash << 5) - hash + opName.charCodeAt(i)) | 0;
        }
        const hue = Math.abs(hash) % 360;
        const color = `hsl(${hue}, 68%, 56%)`;
        colorCache.set(opName, color);
        return color;
    }

    function clearVisualizer(message = 'Run Smart Magic Search to generate ranked branches.') {
        if (visualizerGraph) {
            visualizerGraph.innerHTML = '';
        }
        if (visualizerSvg) {
            visualizerSvg.setAttribute('viewBox', '0 0 960 320');
            visualizerSvg.setAttribute('width', '960');
            visualizerSvg.setAttribute('height', '320');
        }
        resetVisualizerTransform();
        if (visualizerStats) visualizerStats.textContent = message;
        if (visualizerBranchList) visualizerBranchList.innerHTML = '<div class="visualizer-empty">Run Smart Magic Search to inspect ranked branches.</div>';
        if (visualizerSelectionMeta) visualizerSelectionMeta.textContent = 'Select a branch to inspect its path and nearby alternatives.';
        if (visualizerSelectionPath) visualizerSelectionPath.innerHTML = '';
        visRuntime.branches = [];
        visRuntime.filteredBranches = [];
        visRuntime.branchElById.clear();
        visRuntime.treeNodes.clear();
        visRuntime.childrenById.clear();
        visRuntime.parentById.clear();
        visRuntime.matches = [];
        visRuntime.matchIndex = -1;
        visRuntime.selectedBranchId = '';
    }

    function renderVisualizer(results, meta = {}) {
        if (!visualizerGraph || !visualizerSvg) return;

        const maxNodes = 2200;
        const maxEdges = 3600;
        const nodes = new Map();
        const childrenById = new Map();
        const branches = [];

        nodes.set('root', {
            id: 'root',
            depth: 0,
            op: 'Input',
            score: 0,
            count: 1,
            sample: meta.input || '',
            pathText: '(input)',
            pathOps: []
        });
        childrenById.set('root', []);

        let truncated = false;
        const allPathsCount = results ? results.length : 0;

        if (results && results.length > 0) {
            for (let r = 0; r < results.length; r++) {
                const res = results[r];
                const path = materializePathFromResult(res);
                if (!path || path.length === 0) continue;

                let parentId = 'root';
                let parentPathText = '';
                let branchTruncated = false;

                for (let i = 0; i < path.length; i++) {
                    const op = path[i];
                    const nodeId = parentId + '>' + op;
                    const pathText = parentPathText ? (parentPathText + ' -> ' + op) : op;

                    let node = nodes.get(nodeId);
                    if (!node) {
                        if (nodes.size >= maxNodes || (nodes.size - 1) >= maxEdges) {
                            truncated = true;
                            branchTruncated = true;
                            break;
                        }
                        const parentNode = nodes.get(parentId);
                        node = {
                            id: nodeId,
                            depth: i + 1,
                            op,
                            count: 0,
                            score: typeof res.score === 'number' ? res.score : 0,
                            sample: (res.text || '').slice(0, 120),
                            pathText,
                            pathOps: parentNode && parentNode.pathOps ? parentNode.pathOps.concat(op) : [op]
                        };
                        nodes.set(nodeId, node);
                        if (!childrenById.has(parentId)) childrenById.set(parentId, []);
                        childrenById.get(parentId).push(node);
                        if (!childrenById.has(nodeId)) childrenById.set(nodeId, []);
                    } else if (typeof res.score === 'number' && res.score > node.score) {
                        node.score = res.score;
                        if (res.text) node.sample = res.text.slice(0, 120);
                    }

                    node.count += 1;
                    parentId = nodeId;
                    parentPathText = pathText;
                }

                if (!branchTruncated) {
                    branches.push({
                        id: `branch-${r + 1}`,
                        rank: branches.length + 1,
                        score: typeof res.score === 'number' ? res.score : 0,
                        text: res.text || '',
                        pathOps: path.slice(),
                        pathText: path.join(' -> '),
                        leafId: parentId
                    });
                }

                if (truncated) break;
            }
        }
        for (const [parentId, children] of childrenById.entries()) {
            children.sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.op.localeCompare(b.op);
            });
            for (let i = 0; i < children.length; i++) {
                visRuntime.parentById.set(children[i].id, parentId);
            }
        }

        visRuntime.treeNodes = nodes;
        visRuntime.childrenById = childrenById;
        visRuntime.branches = branches;
        visRuntime.filteredBranches = branches.slice();
        visRuntime.matches = branches.slice();
        visRuntime.matchIndex = branches.length > 0 ? 0 : -1;
        visRuntime.selectedBranchId = '';

        if (typeof runVisualizerSearch === 'function') runVisualizerSearch(true);
        if (visualizerStats) {
            const truncatedText = truncated ? ' Rendering trimmed for explorer limits.' : '';
            visualizerStats.textContent = `Branch Explorer: ${branches.length} branch${branches.length === 1 ? '' : 'es'} from ${allPathsCount} result${allPathsCount === 1 ? '' : 's'}.${truncatedText}`;
        }
    }

    // Fix #9 — helper to set empty-state text via DOM APIs instead of innerHTML
    function setEmptyState(container, message) {
        container.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'empty-state';
        div.textContent = message;
        container.appendChild(div);
    }

    function getActiveOps() {
        return Object.keys(toggleCheckboxes).filter(op => toggleCheckboxes[op].checked);
    }

    function setInitialSequencePopover(open) {
        initialSequencePopoverOpen = !!open;
        if (sequenceBuilder) sequenceBuilder.classList.toggle('hidden', !initialSequencePopoverOpen);
        if (initialSequenceTrigger) initialSequenceTrigger.setAttribute('aria-expanded', initialSequencePopoverOpen ? 'true' : 'false');
        if (initialSequencePopoverOpen) updateSequencePopoverWidth();
    }

    function updateInitialSequenceSummary() {
        const count = initialSequenceOps.length;
        const countLabel = `${count} step${count === 1 ? '' : 's'}`;

        if (initialSequenceCount) {
            initialSequenceCount.textContent = countLabel;
            initialSequenceCount.classList.toggle('is-empty', count === 0);
        }
        if (initialSequenceLength) {
            initialSequenceLength.textContent = countLabel;
            initialSequenceLength.classList.toggle('is-empty', count === 0);
        }

        const summary = initialSequenceTrigger?.querySelector('.sequence-trigger-summary');
        if (summary) {
            summary.textContent = count === 0 ? 'Sequence' : `${countLabel} selected`;
        }
        if (initialSequenceClearBtn) {
            initialSequenceClearBtn.disabled = count === 0;
        }
    }

    function getInitialSequenceStatusText(sequence = initialSequenceOps) {
        const count = Array.isArray(sequence) ? sequence.length : 0;
        if (count <= 0) return '';
        return `, initial sequence: ${count} step${count === 1 ? '' : 's'}`;
    }

    function updateSequencePopoverWidth() {
        if (!sequenceBuilder || !initialSequenceAvailable || !initialSequenceTrigger) return;
        sequenceBuilder.style.width = '';
        sequenceBuilder.style.minWidth = '';
        sequenceBuilder.style.maxWidth = '';
        sequenceBuilder.style.left = '';
        sequenceBuilder.style.right = '';
        sequenceBuilder.style.transform = '';

        const viewportWidth = Math.max(320, window.innerWidth || 0);
        const desired = Math.max(
            640,
            Math.min(initialSequenceAvailable.scrollWidth + 72, viewportWidth - 24)
        );
        const applied = Math.min(desired, viewportWidth - 24);
        sequenceBuilder.style.width = `${applied}px`;
        sequenceBuilder.style.minWidth = `${Math.min(640, applied)}px`;
        sequenceBuilder.style.maxWidth = `${viewportWidth - 24}px`;

        const anchorRect = sequenceBuilder.parentElement?.getBoundingClientRect();
        const triggerRect = initialSequenceTrigger.getBoundingClientRect();
        if (!anchorRect) return;

        const viewportPadding = 12;
        const desiredLeft = triggerRect.left + (triggerRect.width / 2) - (applied * 0.35);
        const clampedLeft = Math.max(
            viewportPadding,
            Math.min(desiredLeft, viewportWidth - applied - viewportPadding)
        );
        sequenceBuilder.style.left = `${clampedLeft - anchorRect.left}px`;
        sequenceBuilder.style.right = 'auto';
        sequenceBuilder.style.transform = 'none';
    }

    function renderSelectedSequence() {
        if (!initialSequenceSelected) return;
        initialSequenceSelected.innerHTML = '';
        updateInitialSequenceSummary();

        if (initialSequenceOps.length === 0) {
            const placeholder = document.createElement('span');
            placeholder.className = 'sequence-placeholder';
            placeholder.textContent = 'No initial sequence selected.';
            initialSequenceSelected.appendChild(placeholder);
            return;
        }

        initialSequenceOps.forEach((opName, index) => {
            const block = document.createElement('div');
            block.className = 'sequence-block';
            block.draggable = true;
            block.dataset.index = String(index);

            const stepBadge = document.createElement('span');
            stepBadge.className = 'sequence-step-badge';
            stepBadge.textContent = String(index + 1);
            block.appendChild(stepBadge);

            const label = document.createElement('span');
            label.className = 'sequence-block-label';
            label.textContent = opName;
            block.appendChild(label);

            const controls = document.createElement('div');
            controls.className = 'sequence-block-controls';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'sequence-block-btn danger';
            removeBtn.textContent = '×';
            removeBtn.setAttribute('aria-label', `Remove ${opName} from sequence`);
            removeBtn.addEventListener('click', () => {
                initialSequenceOps.splice(index, 1);
                renderSelectedSequence();
            });
            controls.appendChild(removeBtn);

            block.appendChild(controls);

            block.addEventListener('dragstart', (e) => {
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(index));
                }
                block.classList.add('dragging');
            });

            block.addEventListener('dragend', () => {
                block.classList.remove('dragging');
                initialSequenceSelected.querySelectorAll('.sequence-block').forEach((el) => {
                    el.classList.remove('drag-target');
                });
            });

            block.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (block.classList.contains('dragging')) return;
                block.classList.add('drag-target');
            });

            block.addEventListener('dragleave', () => {
                block.classList.remove('drag-target');
            });

            block.addEventListener('drop', (e) => {
                e.preventDefault();
                block.classList.remove('drag-target');
                if (!e.dataTransfer) return;
                const fromIndex = Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
                const toIndex = index;
                if (!Number.isFinite(fromIndex) || fromIndex === toIndex || fromIndex < 0 || fromIndex >= initialSequenceOps.length) {
                    return;
                }
                const moved = initialSequenceOps.splice(fromIndex, 1)[0];
                initialSequenceOps.splice(toIndex, 0, moved);
                renderSelectedSequence();
            });

            initialSequenceSelected.appendChild(block);
        });
    }

    function renderAvailableSequenceOps() {
        if (!initialSequenceAvailable) return;
        initialSequenceAvailable.innerHTML = '';

        const activeOps = getActiveOps();
        const allowed = new Set(activeOps);
        initialSequenceOps = initialSequenceOps.filter(op => allowed.has(op));
        renderSelectedSequence();

        if (activeOps.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'sequence-placeholder';
            empty.textContent = 'Enable ciphers above to build a sequence.';
            initialSequenceAvailable.appendChild(empty);
            return;
        }

        activeOps.forEach((opName) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'sequence-chip';
            chip.textContent = opName;
            chip.setAttribute('aria-label', `Add ${opName} to initial sequence`);
            chip.addEventListener('click', () => {
                initialSequenceOps.push(opName);
                renderSelectedSequence();
                setInitialSequencePopover(true);
            });
            initialSequenceAvailable.appendChild(chip);
        });

        updateSequencePopoverWidth();
    }

    // Generate checkboxes from Registry
    const Operations = window.Decoder.Operations;
    const toggleCheckboxes = {};

    // Grab the hardcoded XOR toggle that we placed in index.html
    const xorCb = document.getElementById('xor-toggle');
    if (xorCb) {
        toggleCheckboxes['XOR'] = xorCb;
    }

    for (const opName of Object.keys(Operations)) {
        if (opName === 'XOR') {
            continue; // Already handled above
        }
        const label = document.createElement('label');
        label.className = 'toggle-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opName;
        cb.checked = Operations[opName].defaultActive !== undefined ? Operations[opName].defaultActive : true;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + opName));
        operationsToggles.appendChild(label);
        toggleCheckboxes[opName] = cb;
    }

    Object.values(toggleCheckboxes).forEach((cb) => {
        cb.addEventListener('change', renderAvailableSequenceOps);
    });
    if (initialSequenceClearBtn) {
        initialSequenceClearBtn.addEventListener('click', () => {
            initialSequenceOps = [];
            renderSelectedSequence();
        });
    }
    if (initialSequenceTrigger) {
        initialSequenceTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            setInitialSequencePopover(!initialSequencePopoverOpen);
        });
    }
    if (sequenceBuilder) {
        sequenceBuilder.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    document.addEventListener('click', () => {
        if (initialSequencePopoverOpen) setInitialSequencePopover(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && visualizerOverlayOpen) {
            closeVisualizerOverlay();
        } else if (e.key === 'Escape' && initialSequencePopoverOpen) {
            setInitialSequencePopover(false);
        }
    });
    window.addEventListener('resize', () => {
        if (initialSequencePopoverOpen) updateSequencePopoverWidth();
    });
    renderAvailableSequenceOps();
    updateInitialSequenceSummary();
    setInitialSequencePopover(false);

    // Buttons setup
    btnClear.addEventListener('click', () => {
        inputText.value = '';
        cribText.value = '';
        initialSequenceOps = [];
        renderSelectedSequence();
        setInitialSequencePopover(false);
        setEmptyState(outputContainer, 'Enter text and choose an operation to begin.');
        clearVisualizer();
        setResultsTab('output');
        statusIndicator.textContent = 'Ready';
        statusIndicator.className = 'status-indicator';
        if (progressWrap) progressWrap.classList.add('hidden');
        if (progressBar) progressBar.style.width = '0%';
    });

    // Tooltip hover helper for info icons
    function bindHoverTooltip(wrapperId, tooltipId, tooltipWidth = 320) {
        const wrapper = document.getElementById(wrapperId);
        const tooltip = document.getElementById(tooltipId);
        if (!wrapper || !tooltip) return;

        const margin = 8;

        wrapper.addEventListener('mouseenter', () => {
            tooltip.classList.add('visible');
        });
        wrapper.addEventListener('mousemove', (e) => {
            const dynamicWidth = Math.min(tooltipWidth, Math.max(220, window.innerWidth - (margin * 2)));
            tooltip.style.width = dynamicWidth + 'px';

            // Prefer right side of cursor, then clamp fully inside viewport.
            let leftPos = e.clientX + 15;
            if (leftPos + dynamicWidth > window.innerWidth - margin) {
                leftPos = e.clientX - dynamicWidth - 10;
            }
            leftPos = Math.max(margin, Math.min(leftPos, window.innerWidth - dynamicWidth - margin));

            const tipHeight = tooltip.offsetHeight || 140;
            let topPos = e.clientY - 40;
            topPos = Math.max(margin, Math.min(topPos, window.innerHeight - tipHeight - margin));

            tooltip.style.left = leftPos + 'px';
            tooltip.style.top = topPos + 'px';
        });
        wrapper.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });
    }

    bindHoverTooltip('xor-info-icon', 'global-info-tooltip', 300);
    bindHoverTooltip('crazy-info-icon', 'global-crazy-tooltip', 380);

    // Reuse the existing materializePathFromResult helper

    function displayResults(results, isAllDecodes = false, renderOptions = {}) {
        outputContainer.innerHTML = '';

        if (!results || results.length === 0) {
            setEmptyState(outputContainer, 'No decodes yielded printable text.');
            return;
        }

        const limit = Math.max(1, renderOptions.limit ?? 30);
        const toShow = results.slice(0, limit);
        const compactPath = !!renderOptions.compactPath;
        const compactPathThreshold = Math.max(6, renderOptions.compactPathThreshold ?? 10);

        function renderPathBadges(pathContainer, pathItems) {
            pathContainer.innerHTML = '';
            pathItems.forEach((p, idx) => {
                const badge = document.createElement('span');
                badge.className = 'path-badge';
                badge.textContent = p;
                pathContainer.appendChild(badge);

                if (idx < pathItems.length - 1) {
                    const arrow = document.createElement('span');
                    arrow.className = 'path-arrow';
                    arrow.textContent = '→';
                    pathContainer.appendChild(arrow);
                }
            });
        }

        toShow.forEach(res => {
            const clone = resultTemplate.content.cloneNode(true);
            const pathContainer = clone.querySelector('.path-badges');
            const useSequenceBtn = clone.querySelector('.use-sequence-btn');

            // Fix #8 — Guard against unmaterialized paths
            const rawPathArr = materializePathFromResult(res);
            const pathArr = rawPathArr.length > 0 ? rawPathArr : ['Unknown'];
            const displayPath = (compactPath && pathArr.length > compactPathThreshold)
                ? [...pathArr.slice(0, 4), '…', ...pathArr.slice(-4)]
                : pathArr;

            renderPathBadges(pathContainer, displayPath);

            if (useSequenceBtn) {
                useSequenceBtn.addEventListener('click', () => {
                    initialSequenceOps = pathArr.filter(Boolean);
                    renderSelectedSequence();
                    setInitialSequencePopover(false);
                    if (initialSequenceTrigger) {
                        initialSequenceTrigger.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                });
            }

            const scoreSpan = clone.querySelector('.score-badge');
            if (isAllDecodes) {
                scoreSpan.style.display = 'none';
            } else {
                // Fix #1 — Use shared constant instead of magic number
                const safeScore = typeof res.score === 'number' ? res.score : -9999;
                const scoreFormat = safeScore >= CRIB_MATCH_SCORE
                    ? `${CRIB_MATCH_SCORE} (Crib Match)`
                    : safeScore.toFixed(2);
                scoreSpan.querySelector('.score-value').textContent = scoreFormat;

                if (safeScore >= CRIB_MATCH_SCORE) scoreSpan.classList.add('high');
                else if (safeScore < 0) scoreSpan.classList.add('low');
            }

            const textarea = clone.querySelector('textarea');
            textarea.value = typeof res.text === 'string' ? res.text : String(res.text ?? '');

            const copyBtn = clone.querySelector('.copy-result-btn');
            if (copyBtn) {
                // Create SVG icon templates via DOM APIs for CSP safety
                const svgNS = 'http://www.w3.org/2000/svg';
                function createClipboardIcon() {
                    const svg = document.createElementNS(svgNS, 'svg');
                    svg.setAttribute('viewBox', '0 0 24 24');
                    svg.setAttribute('aria-hidden', 'true');
                    const r1 = document.createElementNS(svgNS, 'rect');
                    r1.setAttribute('x', '9'); r1.setAttribute('y', '9');
                    r1.setAttribute('width', '11'); r1.setAttribute('height', '11');
                    r1.setAttribute('rx', '2'); r1.setAttribute('ry', '2');
                    const r2 = document.createElementNS(svgNS, 'rect');
                    r2.setAttribute('x', '4'); r2.setAttribute('y', '4');
                    r2.setAttribute('width', '11'); r2.setAttribute('height', '11');
                    r2.setAttribute('rx', '2'); r2.setAttribute('ry', '2');
                    svg.appendChild(r1); svg.appendChild(r2);
                    return svg;
                }
                function createCheckIcon() {
                    const svg = document.createElementNS(svgNS, 'svg');
                    svg.setAttribute('viewBox', '0 0 24 24');
                    svg.setAttribute('aria-hidden', 'true');
                    const p = document.createElementNS(svgNS, 'polyline');
                    p.setAttribute('points', '20 6 9 17 4 12');
                    svg.appendChild(p);
                    return svg;
                }
                copyBtn.addEventListener('click', async () => {
                    const textToCopy = textarea.value || '';
                    if (!textToCopy) return;

                    let copied = false;
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        try {
                            await navigator.clipboard.writeText(textToCopy);
                            copied = true;
                        } catch (e) { }
                    }

                    if (!copied) {
                        textarea.focus();
                        textarea.select();
                        try {
                            copied = document.execCommand('copy');
                        } catch (e) {
                            copied = false;
                        }
                        textarea.setSelectionRange(0, 0);
                        textarea.blur();
                    }

                    if (copied) {
                        copyBtn.textContent = '';
                        copyBtn.appendChild(createCheckIcon());
                        setTimeout(() => {
                            copyBtn.textContent = '';
                            copyBtn.appendChild(createClipboardIcon());
                        }, 900);
                    }
                });
            }

            if (res.isError) {
                textarea.style.color = 'var(--danger)';
                textarea.style.fontStyle = 'italic';
            }
            outputContainer.appendChild(clone);

        });
    }

    clearVisualizer();
    setupVisualizerInteractions();

    // Fix #5 — Replace setTimeout wrapper with await yieldToUI()
    async function process(action) {
        const input = inputText.value.trim();
        const crib = cribText.value.trim();
        const crazyMode = !!(crazyModeToggle && crazyModeToggle.checked && action === 'magic');

        // Fix #7 — Inline status message instead of blocking alert()
        if (!input) {
            statusIndicator.textContent = 'Please enter input text.';
            statusIndicator.className = 'status-indicator error';
            return;
        }

        statusIndicator.textContent = 'Processing...';
        statusIndicator.className = 'status-indicator loading';
        if (progressWrap) progressWrap.classList.toggle('hidden', action !== 'magic');
        if (progressBar) progressBar.style.width = '0%';

        // Yield to let the UI update before heavy computation
        await yieldToUI();

        const startTime = performance.now();
        let results = [];
        let crazyPayload = null;
        const parsedDepth = parseInt(magicDepthInput.value, 10);
        let magicDepth = Number.isFinite(parsedDepth) ? parsedDepth : 10;
        if (magicDepth < 1) magicDepth = 1;

        const activeOps = getActiveOps();
        const activeSet = new Set(activeOps);
        const initialSeq = initialSequenceOps.filter(op => activeSet.has(op));

        const xorKeyUI = document.getElementById('xor-key');
        const xorKeyTypeUI = document.getElementById('xor-key-type');
        const xorKeyVal = xorKeyUI ? xorKeyUI.value.trim() : '';
        const xorKeyTypeVal = xorKeyTypeUI ? xorKeyTypeUI.value : 'utf8';

        const options = {
            crib: crib,
            maxDepth: magicDepth,
            activeOps: activeOps,
            initialSequence: initialSeq,
            xorKey: xorKeyVal,
            xorKeyType: xorKeyTypeVal,
            onProgress: action === 'magic' && !crazyMode ? (fraction, depth, totalDepth) => {
                if (progressBar) {
                    const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
                    progressBar.style.width = `${pct}%`;
                }
                statusIndicator.textContent = `Processing... (${depth}/${totalDepth})`;
            } : null
        };

        if (action === 'all') {
            results = await runAllDecodes(input, options);
        } else if (action === 'magic') {
            if (crazyMode) {
                const crazyDepth = Math.max(10, magicDepth);
                if (progressBar) progressBar.style.width = '100%';
                clearVisualizer('Visualizer disabled while Crazy Mode is running.');
                setResultsTab('output');

                crazyPayload = await runCrazyMagic(input, {
                    ...options,
                    crazyMaxDepth: crazyDepth,
                    crazyMaxRuntimeMs: Number.POSITIVE_INFINITY,
                    crazyReportIntervalMs: 5000,
                    onProgress: (meta) => {
                        statusIndicator.textContent = `depth<=${crazyDepth} | ${Math.round(meta.elapsedMs / 1000)}s | expanded ${meta.expansions.toLocaleString()} | frontier ${meta.frontier.toLocaleString()} | seen ${meta.seen.toLocaleString()}`;
                    },
                    onCandidateUpdate: (meta) => {
                        if (meta.candidates && meta.candidates.length > 0) {
                            try {
                                displayResults(meta.candidates, false, {
                                    limit: 12,
                                    compactPath: false
                                });
                            } catch (e) {
                                statusIndicator.textContent = `Crazy Mode rendering error (continuing search): ${e.message || 'unknown'}`;
                            }
                        }
                        statusIndicator.textContent = `depth<=${crazyDepth} | ${Math.round(meta.elapsedMs / 1000)}s | expanded ${meta.expansions.toLocaleString()} | top ${meta.candidates.length}`;
                    }
                });
                results = crazyPayload.results || [];
            } else {
                results = await runMagic(input, options);
            }
        }

        const finalRenderLimit = crazyMode ? 20 : 30;
        displayResults(results, action === 'all', {
            limit: finalRenderLimit,
            compactPath: false
        });
        if (!crazyMode) {
            renderVisualizer(results, { action, activeOps, input });
            setResultsTab(activeResultsTab);
        }

        const elapsed = (performance.now() - startTime).toFixed(1);
        if (crazyMode && crazyPayload) {
            const foundText = crazyPayload.found ? 'crib found' : `completed: ${crazyPayload.reason}`;
            statusIndicator.textContent = `Crazy Mode done (${foundText}${getInitialSequenceStatusText(initialSeq)}) | depth<=${crazyPayload.maxDepth || 10} | expanded ${crazyPayload.expansions.toLocaleString()} | ${(crazyPayload.elapsedMs / 1000).toFixed(1)}s`;
        } else {
            statusIndicator.textContent = `Done (${results.length} results, ${elapsed}ms${getInitialSequenceStatusText(initialSeq)})`;
        }
        statusIndicator.className = 'status-indicator';
        if (progressBar) progressBar.style.width = '100%';
        if (progressWrap) progressWrap.classList.add('hidden');
    }

    btnAllDecodes.addEventListener('click', () => process('all'));
    btnMagic.addEventListener('click', () => process('magic'));
});
