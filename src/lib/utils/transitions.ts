import { slide, type SlideParams, type TransitionConfig } from 'svelte/transition';

/**
 * `slide`, skipped when the element is not laid out — e.g. in a tab
 * panel kept mounted but hidden. `slide` reads the computed height,
 * which is `auto` there: the browser then rejects every keyframe
 * (`NaNpx`) and logs a warning per element.
 */
export function slideIfShown(node: Element, params?: SlideParams): TransitionConfig {
	if (node.getClientRects().length === 0) return { duration: 0 };
	return slide(node, params);
}
