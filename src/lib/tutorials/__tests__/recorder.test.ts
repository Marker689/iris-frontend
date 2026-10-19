import { afterEach, describe, expect, it } from 'vitest';
import type { ApiEvent } from '$lib/services/api-events';
import {
	apiStep,
	camelVar,
	deriveAnchor,
	describeElement,
	idFields,
	isRecordableApiEvent,
	isRecordableRoute,
	pruneCaptures,
	routeStep,
	templatisePath
} from '../recorder';
import type { TutorialStep } from '../types';

const event = (overrides: Partial<ApiEvent>): ApiEvent => ({
	method: 'POST',
	path: '/cases',
	status: 200,
	ok: true,
	data: {},
	...overrides
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('what gets recorded', () => {
	it('keeps successful writes the procedure is about', () => {
		expect(isRecordableApiEvent(event({}))).toBe(true);
		expect(isRecordableApiEvent(event({ method: 'DELETE', path: '/cases/3/iocs/4' }))).toBe(true);
	});

	it('skips reads, failures and calls the UI makes on its own', () => {
		expect(isRecordableApiEvent(event({ method: 'GET' }))).toBe(false);
		expect(isRecordableApiEvent(event({ ok: false, status: 400 }))).toBe(false);
		for (const path of [
			'/manage/tutorials/3',
			'/manage/users/me/preferences/tutorials',
			'/auth/refresh',
			'/me',
			'/notifications/12/read',
			'/cases/3/notes/4/presence'
		]) {
			expect(isRecordableApiEvent(event({ path })), path).toBe(false);
		}
	});

	it('skips the recorder pages and login', () => {
		expect(isRecordableRoute('/case/3/iocs')).toBe(true);
		expect(isRecordableRoute('/settings/tutorials/4')).toBe(false);
		expect(isRecordableRoute('/settings/tutorials')).toBe(false);
		expect(isRecordableRoute('/login?next=/')).toBe(false);
	});
});

describe('ids and templates', () => {
	it('camel-cases field names', () => {
		expect(camelVar('case_id')).toBe('caseId');
		expect(camelVar('war_room_id')).toBe('warRoomId');
		expect(camelVar('id')).toBe('id');
	});

	it('picks the top-level ids of a response, enveloped or not', () => {
		const body = {
			ioc_id: 4,
			ioc_uuid: 'x',
			case_id: 3,
			ioc_type_id: '12',
			ioc_value: 'evil.example',
			owner: { user_id: 1 },
			weird_id: 'has space'
		};
		const ids = { ioc_id: 4, case_id: 3, ioc_type_id: '12' };
		expect(idFields(body)).toEqual(ids);
		expect(idFields({ status: 'success', data: body })).toEqual(ids);
		expect(idFields([body])).toEqual({});
		expect(idFields(null)).toEqual({});
	});

	it('replaces whole segments holding a known value', () => {
		expect(templatisePath('/cases/12/iocs/120', { caseId: 12, iocId: 120 })).toBe(
			'/cases/{caseId}/iocs/{iocId}'
		);
		expect(templatisePath('/cases/123', { caseId: 12 })).toBe('/cases/123');
	});
});

describe('apiStep', () => {
	it('captures new ids and turns unknown ids into wildcards', () => {
		const { step, captured } = apiStep(
			event({ path: '/alerts/escalate/77', data: { status: 'success', data: { case_id: 12 } } }),
			{}
		);
		expect(step.waitFor).toEqual({
			kind: 'api',
			method: 'POST',
			path: '/alerts/escalate/*',
			capture: { caseId: 'case_id' }
		});
		expect(step.title).toBe('Create escalate');
		expect(captured).toEqual({ caseId: 12 });
	});

	it('writes known ids as variables and does not capture them again', () => {
		const { step, captured } = apiStep(
			event({ path: '/cases/12/iocs', data: { ioc_id: 5, case_id: 12 } }),
			{ caseId: 12 }
		);
		expect(step.waitFor).toEqual({
			kind: 'api',
			method: 'POST',
			path: '/cases/{caseId}/iocs',
			capture: { iocId: 'ioc_id' }
		});
		expect(step.title).toBe('Create IOCs');
		expect(captured).toEqual({ iocId: 5 });
	});

	it('leaves out an empty capture', () => {
		const { step } = apiStep(event({ method: 'PUT', path: '/cases/12', data: {} }), {
			caseId: 12
		});
		expect(step.waitFor).toEqual({ kind: 'api', method: 'PUT', path: '/cases/{caseId}' });
		expect(step.title).toBe('Update cases');
	});
});

describe('routeStep', () => {
	it('links to pages built from known values', () => {
		const { step, captured } = routeStep('/case/12/iocs?tab=x', { caseId: 12 });
		expect(step).toEqual({
			title: 'Go to /case/{caseId}/iocs',
			body: '',
			goTo: '/case/{caseId}/iocs',
			waitFor: { kind: 'route', path: '/case/{caseId}/iocs' }
		});
		expect(captured).toEqual({});
	});

	it('binds ids of things that existed before, without a link', () => {
		const { step, captured } = routeStep('/war-rooms/4/cases', {});
		expect(step.goTo).toBeUndefined();
		expect(step.waitFor).toEqual({ kind: 'route', path: '/war-rooms/{warRoomId}/cases' });
		expect(captured).toEqual({ warRoomId: 4 });
	});

	it('keeps bound names unique', () => {
		const { step, captured } = routeStep('/case/5', { caseId: 12 });
		expect(step.waitFor).toEqual({ kind: 'route', path: '/case/{caseId2}' });
		expect(captured).toEqual({ caseId2: 5 });
	});
});

describe('pruneCaptures', () => {
	it('drops captures no later step uses', () => {
		const steps: TutorialStep[] = [
			{
				title: 'Create',
				body: '',
				waitFor: {
					kind: 'api',
					method: 'POST',
					path: '/cases',
					capture: { caseId: 'case_id', clientId: 'client_id' }
				}
			},
			{
				title: 'Add',
				body: '',
				waitFor: {
					kind: 'api',
					method: 'POST',
					path: '/cases/{caseId}/iocs',
					capture: { iocId: 'ioc_id' }
				}
			}
		];
		const [first, second] = pruneCaptures(steps);
		expect(first.waitFor).toEqual({
			kind: 'api',
			method: 'POST',
			path: '/cases',
			capture: { caseId: 'case_id' }
		});
		expect(second.waitFor).toEqual({ kind: 'api', method: 'POST', path: '/cases/{caseId}/iocs' });
	});

	it('counts every place a later step can use a value', () => {
		const create: TutorialStep = {
			title: 'Create',
			body: '',
			waitFor: { kind: 'api', method: 'POST', path: '/x', capture: { a: 'a', b: 'b', c: 'c' } }
		};
		const later: TutorialStep[] = [
			{ title: '', body: '', fills: [{ anchor: 'f', label: '', value: '{a}' }] },
			{ title: '', body: '', anchor: ['x', 'row-{b}'] },
			{ title: '', body: '', waitFor: { kind: 'element', anchor: 'form-{c}' } }
		];
		const wait = pruneCaptures([create, ...later])[0].waitFor;
		expect(wait?.kind === 'api' && wait.capture).toEqual({ a: 'a', b: 'b', c: 'c' });
	});
});

describe('deriveAnchor', () => {
	const mount = (html: string): Element => {
		document.body.innerHTML = html;
		return document.querySelector('[data-target]') as Element;
	};

	it('prefers data-tour, walking up from an icon', () => {
		const el = mount(
			'<button data-tour="case-new" data-testid="x"><svg data-target></svg></button>'
		);
		expect(deriveAnchor(el)).toBe('case-new');
	});

	it('falls back to data-testid, then a templated link', () => {
		expect(deriveAnchor(mount('<div data-testid="a&quot;b" data-target></div>'))).toBe(
			'[data-testid="a\\"b"]'
		);
		expect(
			deriveAnchor(mount('<a href="/case/12/iocs?x=1"><span data-target></span></a>'), {
				caseId: 12
			})
		).toBe('a[href="/case/{caseId}/iocs"]');
	});

	it('uses hand-written ids but not generated ones', () => {
		expect(deriveAnchor(mount('<input id="merge-alert-case-title" data-target />'))).toBe(
			'#merge-alert-case-title'
		);
		expect(
			deriveAnchor(mount('<button id="bits-c12" aria-label="Split triage" data-target></button>'))
		).toBe('button[aria-label="Split triage"]');
	});

	it('gives up without anything stable', () => {
		expect(deriveAnchor(mount('<div><span data-target>text</span></div>'))).toBeNull();
	});
});

describe('describeElement', () => {
	it('uses the label, else the text, shortened', () => {
		document.body.innerHTML = `<button aria-label="Add IOC">+</button><p>${'word '.repeat(20)}</p>`;
		expect(describeElement(document.querySelector('button') as Element)).toBe('Add IOC');
		const text = describeElement(document.querySelector('p') as Element);
		expect(text).toHaveLength(40);
		expect(text.endsWith('…')).toBe(true);
	});
});
