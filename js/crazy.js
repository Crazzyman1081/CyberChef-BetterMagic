/**
 * BetterMagic - Crazy Mode Search Module
 *
 * Optimizations applied:
 *  - Max-heap frontier (O(log n) pop instead of O(n) linear scan)
 *  - Min-heap top-K candidates (O(log k) insert instead of O(k log k) sort)
 *  - Ring-buffer seen queue (O(1) eviction instead of O(n) array.shift)
 */

(function () {
    // --- Max-Heap (highest score at top) ---
    class MaxHeap {
        constructor() { this._h = []; }
        get length() { return this._h.length; }

        _swap(i, j) { const t = this._h[i]; this._h[i] = this._h[j]; this._h[j] = t; }

        _up(i) {
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (this._h[p].score >= this._h[i].score) break;
                this._swap(p, i);
                i = p;
            }
        }

        _down(i) {
            const len = this._h.length;
            while (true) {
                const l = i * 2 + 1, r = l + 1;
                let largest = i;
                if (l < len && this._h[l].score > this._h[largest].score) largest = l;
                if (r < len && this._h[r].score > this._h[largest].score) largest = r;
                if (largest === i) break;
                this._swap(i, largest);
                i = largest;
            }
        }

        push(item) {
            this._h.push(item);
            this._up(this._h.length - 1);
        }

        pop() {
            if (this._h.length === 0) return null;
            const top = this._h[0];
            const last = this._h.pop();
            if (this._h.length > 0) {
                this._h[0] = last;
                this._down(0);
            }
            return top;
        }

        // Trim to maxSize keeping highest-scored items
        trim(maxSize) {
            if (this._h.length <= maxSize) return;
            this._h.sort((a, b) => b.score - a.score);
            this._h.length = maxSize;
            // Rebuild heap in O(n)
            for (let i = (this._h.length >> 1) - 1; i >= 0; i--) this._down(i);
        }
    }

    // --- Min-Heap for top-K candidates (lowest score at top for easy eviction) ---
    class TopKHeap {
        constructor(k) { this._h = []; this._k = k; }
        get length() { return this._h.length; }

        _swap(i, j) { const t = this._h[i]; this._h[i] = this._h[j]; this._h[j] = t; }

        _up(i) {
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (this._h[p].score <= this._h[i].score) break;
                this._swap(p, i);
                i = p;
            }
        }

        _down(i) {
            const len = this._h.length;
            while (true) {
                const l = i * 2 + 1, r = l + 1;
                let smallest = i;
                if (l < len && this._h[l].score < this._h[smallest].score) smallest = l;
                if (r < len && this._h[r].score < this._h[smallest].score) smallest = r;
                if (smallest === i) break;
                this._swap(i, smallest);
                i = smallest;
            }
        }

        push(candidate) {
            if (this._h.length < this._k) {
                this._h.push(candidate);
                this._up(this._h.length - 1);
                return;
            }
            if (candidate.score <= this._h[0].score) return;
            this._h[0] = candidate;
            this._down(0);
        }

        drainSorted() {
            return this._h.slice().sort((a, b) => b.score - a.score);
        }
    }

    function createRunCrazyMagic(deps) {
        const {
            yieldToUI,
            textFingerprint,
            shannonEntropySample,
            passesBranchPrefilter,
            passesOutputValidation,
            SELF_INVERTING_OPS
        } = deps || {};

        if (!yieldToUI || !textFingerprint || !shannonEntropySample || !passesBranchPrefilter || !passesOutputValidation || !SELF_INVERTING_OPS) {
            throw new Error('createRunCrazyMagic missing required dependencies.');
        }

        return async function runCrazyMagic(input, options = {}) {
            const crib = (options.crib || '').trim();
            const hasCrib = crib.length > 0;

            const scoreText = window.Decoder.scoreText;
            const Operations = window.Decoder.Operations;
            const activeOpsKeys = options.activeOps || Object.keys(Operations);
            const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
            const onCandidateUpdate = typeof options.onCandidateUpdate === 'function' ? options.onCandidateUpdate : null;

            const reportIntervalMs = Math.max(1000, options.crazyReportIntervalMs || 10000);
            const maxRuntimeMs = Number.isFinite(options.crazyMaxRuntimeMs)
                ? Math.max(10000, options.crazyMaxRuntimeMs)
                : Number.POSITIVE_INFINITY;
            const maxDepth = Math.max(1, options.crazyMaxDepth || options.maxDepth || 10);
            const maxFrontier = Math.max(200, options.crazyMaxFrontier || 8000);
            const maxSeen = Math.max(5000, options.crazyMaxSeen || 250000);
            const topK = Math.max(10, options.crazyTopK || 30);

            const opEntries = [];
            for (let i = 0; i < activeOpsKeys.length; i++) {
                const name = activeOpsKeys[i];
                const op = Operations[name];
                if (op) opEntries.push({ name, op });
            }

            const start = {
                normOps: [],
                pathLen: 0,
                lastOp: '',
                text: input,
                score: scoreText(input, crib, input.length)
            };

            // --- Max-heap frontier (audit 1.2) ---
            const frontier = new MaxHeap();
            frontier.push(start);

            // --- Min-heap top-K candidates (audit 1.3) ---
            const topCandidates = new TopKHeap(topK);

            // --- Ring-buffer seen queue (audit 2.6) ---
            const seenBest = new Map();
            const seenRing = new Array(maxSeen + 1024);
            let seenRingHead = 0;  // next write position
            let seenRingTail = 0;  // next eviction position
            let seenStamp = 0;
            let expansions = 0;
            const startedAt = Date.now();
            let lastReportAt = startedAt;

            function addSeen(fp, score) {
                const prev = seenBest.get(fp);
                if (prev && prev.score >= score) return false;
                const stamp = ++seenStamp;
                seenBest.set(fp, { score, stamp });
                seenRing[seenRingHead] = { fp, stamp };
                seenRingHead = (seenRingHead + 1) % seenRing.length;
                // Evict oldest entries when over budget
                while (seenBest.size > maxSeen && seenRingTail !== seenRingHead) {
                    const oldest = seenRing[seenRingTail];
                    seenRingTail = (seenRingTail + 1) % seenRing.length;
                    if (!oldest) continue;
                    const current = seenBest.get(oldest.fp);
                    if (current && current.stamp === oldest.stamp) {
                        seenBest.delete(oldest.fp);
                    }
                }
                return true;
            }

            function topSnapshot() {
                const sorted = topCandidates.drainSorted();
                for (let i = 0; i < sorted.length; i++) {
                    sorted[i] = {
                        path: Array.isArray(sorted[i].normOps) ? sorted[i].normOps.slice() : [],
                        text: sorted[i].text,
                        score: sorted[i].score
                    };
                }
                return sorted;
            }

            addSeen(textFingerprint(input), start.score);
            topCandidates.push(start);

            let found = null;
            let reason = 'frontier_exhausted';

            while (frontier.length > 0) {
                const now = Date.now();
                if (now - startedAt >= maxRuntimeMs) {
                    reason = 'runtime_limit';
                    break;
                }

                const current = frontier.pop();
                if (!current) break;

                if (hasCrib && current.text && current.text.includes(crib)) {
                    found = {
                        path: Array.isArray(current.normOps) ? current.normOps.slice() : [],
                        text: current.text,
                        score: current.score
                    };
                    reason = 'crib_found';
                    break;
                }

                const parentText = current.text;
                const parentLen = parentText.length;
                if (parentLen === 0 || parentLen > 500000) continue;
                if (current.pathLen >= maxDepth) continue;

                const testPrefix = parentLen > 5000 ? parentText.slice(0, 5000) : parentText;
                const inputEntropy = shannonEntropySample(testPrefix, 512);

                for (let i = 0; i < opEntries.length; i++) {
                    const opName = opEntries[i].name;
                    const op = opEntries[i].op;

                    if (SELF_INVERTING_OPS.has(opName) && current.lastOp === opName) continue;
                    if (!passesBranchPrefilter(opName, testPrefix)) continue;
                    if (op.testRegex && !op.testRegex.test(testPrefix)) continue;
                    if (op.entropyRange) {
                        if (inputEntropy < op.entropyRange[0] || inputEntropy > op.entropyRange[1]) continue;
                    }

                    if (op.isMulti) {
                        let multiRes = null;
                        try { multiRes = op.decode(parentText, options) || null; } catch (e) { multiRes = null; }
                        if (!multiRes) continue;

                        for (let m = 0; m < multiRes.length; m++) {
                            const nextText = multiRes[m].value;
                            const nextOp = multiRes[m].op || opName;
                            if (!nextText || nextText === parentText) continue;
                            

                            const score = scoreText(nextText, crib, parentLen);
                            
                            const fp = textFingerprint(nextText);
                            const normOps = current.normOps.concat(nextOp);
                            if (!addSeen(fp, score)) continue;

                            const candidate = {
                                normOps: normOps,
                                pathLen: current.pathLen + 1,
                                lastOp: nextOp,
                                text: nextText,
                                score
                            };
                            frontier.push(candidate);
                            topCandidates.push(candidate);
                        }
                    } else {
                        let dec = null;
                        try { dec = op.decode(parentText, options) || null; } catch (e) { dec = null; }
                        if (!dec || dec === parentText) continue;
                        

                        const score = scoreText(dec, crib, parentLen);
                        
                        const fp = textFingerprint(dec);
                        const normOps = current.normOps.concat(opName);
                        if (!addSeen(fp, score)) continue;

                        const candidate = {
                            normOps: normOps,
                            pathLen: current.pathLen + 1,
                            lastOp: opName,
                            text: dec,
                            score
                        };
                        frontier.push(candidate);
                        topCandidates.push(candidate);
                    }
                }

                // Trim frontier if it grows too large
                frontier.trim(maxFrontier);

                expansions++;

                if (onProgress && expansions % 200 === 0) {
                    onProgress({
                        elapsedMs: now - startedAt,
                        expansions,
                        frontier: frontier.length,
                        seen: seenBest.size
                    });
                }

                if (onCandidateUpdate && (now - lastReportAt >= reportIntervalMs)) {
                    onCandidateUpdate({
                        elapsedMs: now - startedAt,
                        expansions,
                        frontier: frontier.length,
                        seen: seenBest.size,
                        candidates: topSnapshot()
                    });
                    lastReportAt = now;
                }

                if (expansions % 60 === 0) {
                    await yieldToUI();
                }
            }

            const elapsedMs = Date.now() - startedAt;
            const finalCandidates = topSnapshot();

            if (onCandidateUpdate) {
                onCandidateUpdate({
                    elapsedMs,
                    expansions,
                    frontier: frontier.length,
                    seen: seenBest.size,
                    candidates: finalCandidates
                });
            }

            if (found) {
                finalCandidates.unshift(found);
            }

            return {
                found: !!found,
                reason,
                elapsedMs,
                expansions,
                maxDepth,
                seen: seenBest.size,
                frontier: frontier.length,
                result: found,
                results: finalCandidates
            };
        };
    }

    window.DecoderCrazy = window.DecoderCrazy || {};
    window.DecoderCrazy.createRunCrazyMagic = createRunCrazyMagic;
})();
