/**
 * BetterMagic - Progressive Rendering System
 * 
 * Streams results to UI as they're found instead of waiting for completion
 */

window.DecoderProgressiveRenderer = (function() {
    const BATCH_SIZE = 10; // Render results in batches
    const RENDER_INTERVAL = 100; // ms between renders
    
    class ProgressiveRenderer {
        constructor(container, template) {
            this.container = container;
            this.template = template;
            this.pendingResults = [];
            this.renderedCount = 0;
            this.renderTimer = null;
            this.isActive = false;
            this.fragment = document.createDocumentFragment();
        }
        
        start() {
            this.isActive = true;
            this.pendingResults = [];
            this.renderedCount = 0;
            this.container.innerHTML = '';
            this.scheduleRender();
        }
        
        addResult(result) {
            if (!this.isActive) return;
            this.pendingResults.push(result);
            
            // Render immediately if we have enough results
            if (this.pendingResults.length >= BATCH_SIZE) {
                this.renderBatch();
            }
        }
        
        addResults(results) {
            if (!this.isActive) return;
            this.pendingResults.push(...results);
            
            if (this.pendingResults.length >= BATCH_SIZE) {
                this.renderBatch();
            }
        }
        
        renderBatch() {
            if (!this.isActive || this.pendingResults.length === 0) return;
            
            const batch = this.pendingResults.splice(0, BATCH_SIZE);
            
            // Use document fragment for efficient DOM manipulation
            const fragment = document.createDocumentFragment();
            
            for (const result of batch) {
                const card = this.createResultCard(result);
                if (card) {
                    fragment.appendChild(card);
                    this.renderedCount++;
                }
            }
            
            this.container.appendChild(fragment);
            
            // Schedule next render if more results pending
            if (this.pendingResults.length > 0) {
                this.scheduleRender();
            }
        }
        
        scheduleRender() {
            if (this.renderTimer) return;
            
            this.renderTimer = setTimeout(() => {
                this.renderTimer = null;
                this.renderBatch();
            }, RENDER_INTERVAL);
        }
        
        createResultCard(result) {
            if (!this.template) return null;
            
            const clone = this.template.content.cloneNode(true);
            const card = clone.querySelector('.result-card');
            
            if (!card) return null;
            
            // Populate path badges
            const pathBadges = card.querySelector('.path-badges');
            if (pathBadges && result.path) {
                pathBadges.innerHTML = '';
                for (const op of result.path) {
                    const badge = document.createElement('span');
                    badge.className = 'path-badge';
                    badge.textContent = op;
                    pathBadges.appendChild(badge);
                }
            }
            
            // Set score
            const scoreValue = card.querySelector('.score-value');
            if (scoreValue && typeof result.score === 'number') {
                scoreValue.textContent = result.score.toFixed(2);
            }
            
            // Set result text
            const resultText = card.querySelector('.result-text');
            if (resultText && result.text) {
                resultText.value = result.text;
                resultText.style.height = 'auto';
                resultText.style.height = Math.min(resultText.scrollHeight, 300) + 'px';
            }
            
            // Setup copy button
            const copyBtn = card.querySelector('.copy-result-btn');
            if (copyBtn && resultText) {
                copyBtn.addEventListener('click', () => {
                    resultText.select();
                    document.execCommand('copy');
                    copyBtn.classList.add('copied');
                    setTimeout(() => copyBtn.classList.remove('copied'), 1500);
                });
            }
            
            return card;
        }
        
        finish() {
            // Render any remaining results
            while (this.pendingResults.length > 0) {
                this.renderBatch();
            }

            this.isActive = false;
            
            if (this.renderTimer) {
                clearTimeout(this.renderTimer);
                this.renderTimer = null;
            }
            
            return this.renderedCount;
        }
        
        stop() {
            this.isActive = false;
            this.pendingResults = [];
            
            if (this.renderTimer) {
                clearTimeout(this.renderTimer);
                this.renderTimer = null;
            }
        }
    }
    
    return {
        create: (container, template) => new ProgressiveRenderer(container, template)
    };
})();
