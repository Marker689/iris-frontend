import { describe, expect, it } from 'vitest';
import type { TutorialStep } from '$lib/tutorials/types';
import { emptyStep, fromStepForm, moveItem, toStepForm } from './step-form';

describe('step form', () => {
	it('round-trips a full step', () => {
		const step: TutorialStep = {
			title: 'Add IOCs',
			body: 'One per line.',
			anchor: ['ioc-form', 'case-quick-add'],
			goTo: '/case/{caseId}/iocs',
			fills: [
				{ anchor: 'ioc-values', label: 'Values', value: 'a.example' },
				{ anchor: 'ioc-tlp', label: 'Shared', value: true }
			],
			waitFor: {
				kind: 'api',
				method: 'POST',
				path: '/cases/{caseId}/iocs',
				capture: { iocId: 'ioc_id' }
			}
		};
		expect(fromStepForm(toStepForm(step))).toEqual(step);
	});

	it('round-trips route and element waits and a single anchor', () => {
		const route: TutorialStep = {
			title: 'R',
			body: '',
			anchor: 'a[href="/alerts"]',
			waitFor: { kind: 'route', path: '/alerts' }
		};
		const element: TutorialStep = {
			title: 'E',
			body: '',
			waitFor: { kind: 'element', anchor: 'x' }
		};
		expect(fromStepForm(toStepForm(route))).toEqual(route);
		expect(fromStepForm(toStepForm(element))).toEqual(element);
	});

	it('drops blank optional fields and trims', () => {
		const form = emptyStep();
		form.title = '  Hello ';
		form.anchors = '\n  \n';
		form.goTo = ' ';
		form.fills = [{ label: '', anchor: '', kind: 'text', value: '' }];
		form.captures = [{ name: 'x', field: '' }];
		expect(fromStepForm(form)).toEqual({ title: 'Hello', body: '' });
	});

	it('keeps capture-less API waits free of an empty capture map', () => {
		const form = emptyStep();
		form.wait = 'api';
		form.method = 'DELETE';
		form.apiPath = '/cases/*';
		expect(fromStepForm(form).waitFor).toEqual({ kind: 'api', method: 'DELETE', path: '/cases/*' });
	});

	it('gives every form its own key', () => {
		expect(emptyStep().key).not.toBe(emptyStep().key);
	});
});

describe('moveItem', () => {
	it('moves within bounds and ignores the rest', () => {
		expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
		expect(moveItem(['a', 'b', 'c'], 2, -2)).toEqual(['c', 'a', 'b']);
		const items = ['a'];
		expect(moveItem(items, 0, -1)).toBe(items);
	});
});
