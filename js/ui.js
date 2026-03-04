document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('input-text');
    const cribText = document.getElementById('crib-text');
    const btnAllDecodes = document.getElementById('btn-all-decodes');
    const btnMagic = document.getElementById('btn-magic');
    const btnClear = document.getElementById('btn-clear');
    const outputContainer = document.getElementById('output-container');
    const visualizerPanel = document.getElementById('visualizer-panel');
    const visualizerStats = document.getElementById('visualizer-stats');
    const visualizerOps = document.getElementById('visualizer-ops');
    const visualizerViewport = document.getElementById('visualizer-viewport');
    const visualizerSvg = document.getElementById('visualizer-svg');
    const visualizerGraph = document.getElementById('visualizer-graph');
    const visualizerNodeInfo = document.getElementById('visualizer-node-info');
    const visualizerFullscreenBtn = document.getElementById('visualizer-fullscreen-btn');
    const visSearchChainInput = document.getElementById('vis-search-chain');
    const visSearchCribInput = document.getElementById('vis-search-crib');
    const visSearchBtn = document.getElementById('vis-search-btn');
    const visSearchNextBtn = document.getElementById('vis-search-next-btn');
    const visSearchClearBtn = document.getElementById('vis-search-clear-btn');
    const tabOutput = document.getElementById('tab-output');
    const tabVisualizer = document.getElementById('tab-visualizer');
    const statusIndicator = document.getElementById('status-indicator');
    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const magicDepthInput = document.getElementById('magic-depth');
    const initialSequenceInput = document.getElementById('initial-sequence');
    const crazyModeToggle = document.getElementById('crazy-mode-toggle');
    const operationsToggles = document.getElementById('operations-toggles');
    const resultTemplate = document.getElementById('result-card-template');

    const CRIB_MATCH_SCORE = window.Decoder.CRIB_MATCH_SCORE; // Fix #1
    let activeResultsTab = 'output';
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
    const visRuntime = {
        nodes: [],
        nodeElById: new Map(),
        labelElById: new Map(),
        edgeEls: [],
        parentById: new Map(),
        childCountById: new Map(),
        matches: [],
        matchIndex: -1
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
        if (!visualizerViewport || !visualizerSvg || visState.initialized) return;
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

        function updateFullscreenButton() {
            if (!visualizerFullscreenBtn || !visualizerPanel) return;
            const isFs = document.fullscreenElement === visualizerPanel;
            visualizerFullscreenBtn.textContent = isFs ? 'Exit Full Screen' : 'Full Screen';
        }

        if (visualizerFullscreenBtn && visualizerPanel) {
            visualizerFullscreenBtn.addEventListener('click', async () => {
                try {
                    if (document.fullscreenElement === visualizerPanel) {
                        await document.exitFullscreen();
                    } else {
                        await visualizerPanel.requestFullscreen();
                    }
                } catch (e) { }
                updateFullscreenButton();
            });
            document.addEventListener('fullscreenchange', updateFullscreenButton);
            updateFullscreenButton();
        }

        function parseChainPrefix(raw) {
            if (!raw) return [];
            return raw
                .split(/(?:->|>|,|\s+)/)
                .map(s => s.trim())
                .filter(Boolean)
                .map(s => s.toLowerCase());
        }

        function pathStartsWith(pathOps, prefixOps) {
            if (prefixOps.length === 0) return true;
            if (!pathOps || pathOps.length < prefixOps.length) return false;
            for (let i = 0; i < prefixOps.length; i++) {
                if ((pathOps[i] || '').toLowerCase() !== prefixOps[i]) return false;
            }
            return true;
        }

        function focusMatchedNode(node) {
            if (!node || !visualizerSvg) return;
            const vb = (visualizerSvg.getAttribute('viewBox') || '0 0 1000 600').split(/\s+/).map(Number);
            const vbW = vb[2] || 1000;
            const vbH = vb[3] || 600;
            if (visState.scale < 1.4) visState.scale = 1.4;
            visState.tx = (vbW / 2) - (node.x * visState.scale);
            visState.ty = (vbH / 2) - (node.y * visState.scale);
            scheduleVisualizerTransform();
        }

        function applyVisualizerSearch(focusFirst = true) {
            const chainPrefixOps = parseChainPrefix(visSearchChainInput ? visSearchChainInput.value : '');
            const crib = ((visSearchCribInput ? visSearchCribInput.value : '') || '').trim().toLowerCase();
            const hasFilter = chainPrefixOps.length > 0 || !!crib;

            const terminalMatches = [];
            const matchedLineageIds = new Set();

            for (let i = 0; i < visRuntime.nodes.length; i++) {
                const node = visRuntime.nodes[i];
                const chainOk = pathStartsWith(node.pathOps || [], chainPrefixOps);
                const cribOk = !crib || ((node.sample || '').toLowerCase().includes(crib));
                if (!chainOk || !cribOk) continue;

                const isLeaf = (visRuntime.childCountById.get(node.id) || 0) === 0;
                // If crib is specified, node content is the terminal signal.
                // Otherwise prefer terminal leaf nodes so we highlight solved branches, not attempted side paths.
                if (crib || isLeaf) {
                    terminalMatches.push(node);
                }
            }

            // Fallback to direct matches if leaf filtering removes everything.
            if (hasFilter && terminalMatches.length === 0) {
                for (let i = 0; i < visRuntime.nodes.length; i++) {
                    const node = visRuntime.nodes[i];
                    const chainOk = pathStartsWith(node.pathOps || [], chainPrefixOps);
                    const cribOk = !crib || ((node.sample || '').toLowerCase().includes(crib));
                    if (chainOk && cribOk) terminalMatches.push(node);
                }
            }

            for (let i = 0; i < terminalMatches.length; i++) {
                let currId = terminalMatches[i].id;
                while (currId) {
                    if (matchedLineageIds.has(currId)) break;
                    matchedLineageIds.add(currId);
                    currId = visRuntime.parentById.get(currId) || '';
                }
            }

            for (const [id, el] of visRuntime.nodeElById.entries()) {
                const isMatch = matchedLineageIds.has(id);
                el.classList.toggle('vis-node-match', hasFilter && isMatch);
                el.classList.toggle('vis-node-dim', hasFilter && !isMatch);
            }
            for (const [id, el] of visRuntime.labelElById.entries()) {
                const isMatch = matchedLineageIds.has(id);
                el.classList.toggle('vis-label-dim', hasFilter && !isMatch);
            }
            for (let i = 0; i < visRuntime.edgeEls.length; i++) {
                const edge = visRuntime.edgeEls[i];
                const onLineage = matchedLineageIds.has(edge.from) && matchedLineageIds.has(edge.to);
                edge.el.classList.toggle('vis-edge-match', hasFilter && onLineage);
                edge.el.classList.toggle('vis-edge-dim', hasFilter && !onLineage);
            }

            visRuntime.matches = terminalMatches;
            visRuntime.matchIndex = terminalMatches.length > 0 ? 0 : -1;

            if (visualizerStats) {
                const base = visualizerStats.textContent.split(' | Search:')[0];
                if (hasFilter) {
                    visualizerStats.textContent = `${base} | Search: ${terminalMatches.length} branch match(es)`;
                } else {
                    visualizerStats.textContent = base;
                }
            }

            if (terminalMatches.length > 0 && focusFirst) {
                focusMatchedNode(terminalMatches[0]);
                if (visualizerNodeInfo) {
                    const s = (terminalMatches[0].sample || '').replace(/\s+/g, ' ').slice(0, 180);
                    visualizerNodeInfo.textContent = `${terminalMatches[0].pathText} | visits: ${terminalMatches[0].count} | best score: ${(terminalMatches[0].score || 0).toFixed(2)}${s ? ` | sample: ${s}` : ''}`;
                }
            } else if (hasFilter && visualizerNodeInfo) {
                visualizerNodeInfo.textContent = terminalMatches.length > 0 ? 'Search matches found. Use Next to jump between them.' : 'No matching branches found for the current filter.';
            }
        }

        function jumpToNextSearchMatch() {
            if (!visRuntime.matches || visRuntime.matches.length === 0) return;
            visRuntime.matchIndex = (visRuntime.matchIndex + 1) % visRuntime.matches.length;
            const node = visRuntime.matches[visRuntime.matchIndex];
            focusMatchedNode(node);
            if (visualizerNodeInfo) {
                const s = (node.sample || '').replace(/\s+/g, ' ').slice(0, 180);
                visualizerNodeInfo.textContent = `${node.pathText} | visits: ${node.count} | best score: ${(node.score || 0).toFixed(2)}${s ? ` | sample: ${s}` : ''}`;
            }
        }

        if (visSearchBtn) visSearchBtn.addEventListener('click', () => applyVisualizerSearch(true));
        if (visSearchNextBtn) visSearchNextBtn.addEventListener('click', jumpToNextSearchMatch);
        if (visSearchClearBtn) {
            visSearchClearBtn.addEventListener('click', () => {
                if (visSearchChainInput) visSearchChainInput.value = '';
                if (visSearchCribInput) visSearchCribInput.value = '';
                applyVisualizerSearch(false);
            });
        }
        if (visSearchChainInput) {
            visSearchChainInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') applyVisualizerSearch(true);
            });
        }
        if (visSearchCribInput) {
            visSearchCribInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') applyVisualizerSearch(true);
            });
        }

        runVisualizerSearch = applyVisualizerSearch;
    }

    function setResultsTab(tabName) {
        activeResultsTab = tabName;
        const showVisualizer = tabName === 'visualizer';
        if (outputContainer) outputContainer.classList.toggle('hidden', showVisualizer);
        if (visualizerPanel) visualizerPanel.classList.toggle('hidden', !showVisualizer);
        if (tabOutput) {
            tabOutput.classList.toggle('active', !showVisualizer);
            tabOutput.setAttribute('aria-selected', String(!showVisualizer));
        }
        if (tabVisualizer) {
            tabVisualizer.classList.toggle('active', showVisualizer);
            tabVisualizer.setAttribute('aria-selected', String(showVisualizer));
        }
    }

    if (tabOutput) tabOutput.addEventListener('click', () => setResultsTab('output'));
    if (tabVisualizer) tabVisualizer.addEventListener('click', () => setResultsTab('visualizer'));

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
        let hash = 0;
        for (let i = 0; i < opName.length; i++) {
            hash = ((hash << 5) - hash + opName.charCodeAt(i)) | 0;
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 68%, 56%)`;
    }

    function clearVisualizer(message = 'Run Smart Magic Search to generate a graph.') {
        if (visualizerGraph) visualizerGraph.innerHTML = '';
        if (visualizerSvg) {
            visualizerSvg.setAttribute('viewBox', '0 0 1000 600');
            visualizerSvg.setAttribute('width', '1000');
            visualizerSvg.setAttribute('height', '600');
        }
        resetVisualizerTransform();
        if (visualizerStats) visualizerStats.textContent = message;
        if (visualizerOps) visualizerOps.innerHTML = '';
        if (visualizerNodeInfo) visualizerNodeInfo.textContent = 'Hover or click a node to inspect a branch.';
        visRuntime.nodes = [];
        visRuntime.nodeElById.clear();
        visRuntime.labelElById.clear();
        visRuntime.edgeEls = [];
        visRuntime.parentById.clear();
        visRuntime.childCountById.clear();
        visRuntime.matches = [];
        visRuntime.matchIndex = -1;
    }

    function renderVisualizer(results, meta = {}) {
        if (!visualizerGraph || !visualizerSvg) return;

        const maxNodes = 1600;
        const maxEdges = 2600;
        const nodes = new Map();
        const edges = [];

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

        let truncated = false;
        const allPathsCount = results ? results.length : 0;

        if (results && results.length > 0) {
            for (let r = 0; r < results.length; r++) {
                const res = results[r];
                const path = materializePathFromResult(res);
                if (!path || path.length === 0) continue;

                let parentId = 'root';
                let parentPathText = '';

                for (let i = 0; i < path.length; i++) {
                    const op = path[i];
                    const nodeId = parentId + '>' + op;
                    const pathText = parentPathText ? (parentPathText + ' -> ' + op) : op;

                    let node = nodes.get(nodeId);
                    if (!node) {
                        if (nodes.size >= maxNodes || edges.length >= maxEdges) {
                            truncated = true;
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
                        edges.push({ from: parentId, to: nodeId, op });
                    } else if (typeof res.score === 'number' && res.score > node.score) {
                        node.score = res.score;
                        if (res.text) node.sample = res.text.slice(0, 120);
                    }

                    node.count += 1;
                    parentId = nodeId;
                    parentPathText = pathText;
                }

                if (truncated) break;
            }
        }

        const depthLayers = new Map();
        for (const node of nodes.values()) {
            if (!depthLayers.has(node.depth)) depthLayers.set(node.depth, []);
            depthLayers.get(node.depth).push(node);
        }

        const depths = Array.from(depthLayers.keys()).sort((a, b) => a - b);
        const maxDepth = depths.length > 0 ? depths[depths.length - 1] : 0;
        let maxLayerSize = 1;
        for (const arr of depthLayers.values()) {
            if (arr.length > maxLayerSize) maxLayerSize = arr.length;
        }

        const width = Math.max(1000, 220 + maxDepth * 190);
        const height = Math.max(620, 170 + maxLayerSize * 36);
        const marginX = 90;
        const marginY = 60;
        const usableW = Math.max(1, width - marginX * 2);
        const usableH = Math.max(1, height - marginY * 2);
        const stepX = maxDepth > 0 ? (usableW / maxDepth) : usableW;

        visualizerSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        visualizerSvg.setAttribute('width', String(width));
        visualizerSvg.setAttribute('height', String(height));
        visualizerGraph.innerHTML = '';
        resetVisualizerTransform();
        visRuntime.nodes = [];
        visRuntime.nodeElById.clear();
        visRuntime.labelElById.clear();
        visRuntime.edgeEls = [];
        visRuntime.parentById.clear();
        visRuntime.childCountById.clear();

        const posById = new Map();
        for (const depth of depths) {
            const layer = depthLayers.get(depth);
            layer.sort((a, b) => b.count - a.count);
            for (let i = 0; i < layer.length; i++) {
                const node = layer[i];
                const x = marginX + depth * stepX;
                const y = marginY + ((i + 1) * usableH / (layer.length + 1));
                posById.set(node.id, { x, y, node });
            }
        }

        const svgNS = 'http://www.w3.org/2000/svg';

        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            const p1 = posById.get(edge.from);
            const p2 = posById.get(edge.to);
            if (!p1 || !p2) continue;
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', p1.x);
            line.setAttribute('y1', p1.y);
            line.setAttribute('x2', p2.x);
            line.setAttribute('y2', p2.y);
            line.setAttribute('class', 'vis-edge');
            visualizerGraph.appendChild(line);
            visRuntime.edgeEls.push({ from: edge.from, to: edge.to, el: line });
            visRuntime.parentById.set(edge.to, edge.from);
            visRuntime.childCountById.set(edge.from, (visRuntime.childCountById.get(edge.from) || 0) + 1);
        }

        function setNodeInfo(node) {
            if (!visualizerNodeInfo) return;
            const scoreText = typeof node.score === 'number' ? node.score.toFixed(2) : '0.00';
            const sample = (node.sample || '').replace(/\s+/g, ' ').slice(0, 180);
            visualizerNodeInfo.textContent = `${node.pathText} | visits: ${node.count} | best score: ${scoreText}${sample ? ` | sample: ${sample}` : ''}`;
        }

        for (const depth of depths) {
            const layer = depthLayers.get(depth);
            for (let i = 0; i < layer.length; i++) {
                const node = layer[i];
                const pos = posById.get(node.id);
                const radius = node.depth === 0 ? 8 : Math.min(9, 4 + Math.log2(1 + node.count));

                const circle = document.createElementNS(svgNS, 'circle');
                circle.setAttribute('cx', pos.x);
                circle.setAttribute('cy', pos.y);
                circle.setAttribute('r', radius);
                circle.setAttribute('fill', colorForOp(node.op));
                circle.setAttribute('class', 'vis-node');
                circle.addEventListener('mouseenter', () => setNodeInfo(node));
                circle.addEventListener('click', () => setNodeInfo(node));
                visualizerGraph.appendChild(circle);
                visRuntime.nodeElById.set(node.id, circle);
                visRuntime.nodes.push({
                    id: node.id,
                    x: pos.x,
                    y: pos.y,
                    depth: node.depth,
                    pathText: node.pathText,
                    pathOps: node.pathOps || [],
                    sample: node.sample || '',
                    count: node.count || 0,
                    score: node.score || 0
                });

                const label = document.createElementNS(svgNS, 'text');
                label.setAttribute('x', String(pos.x + radius + 4));
                label.setAttribute('y', String(pos.y + 3));
                label.setAttribute('class', 'vis-label');
                label.textContent = node.depth === 0 ? 'Input' : node.op;
                visualizerGraph.appendChild(label);
                visRuntime.labelElById.set(node.id, label);
            }
        }

        if (visualizerStats) {
            const truncatedText = truncated ? ' (truncated for rendering limits)' : '';
            const mode = meta.action === 'all' ? 'All Decodes' : 'Smart Magic Search';
            visualizerStats.textContent = `${mode}: ${nodes.size} nodes, ${edges.length} edges from ${allPathsCount} results${truncatedText}.`;
        }

        // Auto turbo-pan for very large graphs
        if (nodes.size > 900 || edges.length > 1400 || width > 2200 || height > 1800) {
            visState.panSpeed = 20;
        } else if (nodes.size > 500 || edges.length > 900 || width > 1600 || height > 1300) {
            visState.panSpeed = 8;
        } else {
            visState.panSpeed = visState.defaultPanSpeed;
        }

        if (visualizerOps) {
            visualizerOps.innerHTML = '';
            const ops = Array.isArray(meta.activeOps) ? meta.activeOps : [];
            for (let i = 0; i < ops.length; i++) {
                const chip = document.createElement('span');
                chip.className = 'visualizer-op-chip';
                chip.style.borderColor = colorForOp(ops[i]);
                chip.textContent = ops[i];
                visualizerOps.appendChild(chip);
            }
        }

        if (typeof runVisualizerSearch === 'function') {
            runVisualizerSearch(false);
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

    // Buttons setup
    btnClear.addEventListener('click', () => {
        inputText.value = '';
        cribText.value = '';
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

            // Fix #8 — Guard against unmaterialized paths
            const rawPathArr = materializePathFromResult(res);
            const pathArr = rawPathArr.length > 0 ? rawPathArr : ['Unknown'];
            const displayPath = (compactPath && pathArr.length > compactPathThreshold)
                ? [...pathArr.slice(0, 4), '…', ...pathArr.slice(-4)]
                : pathArr;

            renderPathBadges(pathContainer, displayPath);

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

        const activeOps = Object.keys(toggleCheckboxes).filter(op => toggleCheckboxes[op].checked);

        let initialSeq = [];
        const seqVal = initialSequenceInput.value.trim();
        if (seqVal) {
            const opLookup = {};
            for (const opName of Object.keys(Operations)) {
                opLookup[opName.toLowerCase()] = opName;
            }
            initialSeq = seqVal
                .split(/[,\s]+/)
                .map(s => s.trim().toLowerCase())
                .filter(Boolean)
                .map(s => opLookup[s])
                .filter(Boolean);
        }

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
            statusIndicator.textContent = `Crazy Mode done (${foundText}) | depth<=${crazyPayload.maxDepth || 10} | expanded ${crazyPayload.expansions.toLocaleString()} | ${(crazyPayload.elapsedMs / 1000).toFixed(1)}s`;
        } else {
            statusIndicator.textContent = `Done (${results.length} results, ${elapsed}ms)`;
        }
        statusIndicator.className = 'status-indicator';
        if (progressBar) progressBar.style.width = '100%';
        if (progressWrap) progressWrap.classList.add('hidden');
    }

    btnAllDecodes.addEventListener('click', () => process('all'));
    btnMagic.addEventListener('click', () => process('magic'));
});
