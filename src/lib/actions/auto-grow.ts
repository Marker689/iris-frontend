/**
 * Grow a textarea with its content up to `max` pixels, then scroll.
 * Pass the bound value as `value` so a change made from code (a mention
 * or an emoji inserted, the body cleared after sending) refits it too.
 */
export interface AutoGrowOptions {
	value?: string;
	/** Height in pixels past which the textarea scrolls. */
	max?: number;
}

const DEFAULT_MAX = 240;

export function autoGrow(node: HTMLTextAreaElement, options: AutoGrowOptions = {}) {
	let max = options.max ?? DEFAULT_MAX;

	const fit = () => {
		node.style.height = 'auto';
		const full = node.scrollHeight;
		node.style.height = `${Math.min(full, max)}px`;
		node.style.overflowY = full > max ? 'auto' : 'hidden';
	};

	node.addEventListener('input', fit);
	fit();

	// The height depends on the width (text and placeholder wrap), so a
	// fit measured before layout settled — or before the composer was
	// resized — leaves the textarea too tall. Refit on width changes only:
	// `fit` itself changes the height, which would otherwise loop.
	let width = node.clientWidth;
	const observer =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver(() => {
					if (node.clientWidth === width) return;
					width = node.clientWidth;
					fit();
				});
	observer?.observe(node);

	return {
		update(next: AutoGrowOptions = {}) {
			max = next.max ?? DEFAULT_MAX;
			// After the value attribute of this update is applied.
			queueMicrotask(fit);
		},
		destroy() {
			node.removeEventListener('input', fit);
			observer?.disconnect();
		}
	};
}
