import { describe, expect, it } from 'vitest';
import type { LinkedCase } from '$lib/services/war-room-timelines.service';
import { caseSelectionState, filterLinkedCases, withCaseTimelines } from '../case-sources';

const timeline = (timeline_id: number) => ({
	timeline_id,
	name: `T${timeline_id}`,
	color: null,
	is_default: false
});

const cases: LinkedCase[] = [
	{
		case_id: 3566,
		case_name: '#3566 - Hunt for Remote Access',
		timelines: [timeline(1), timeline(2)]
	},
	{ case_id: 12, case_name: '#12 - Phishing wave', timelines: [timeline(3)] },
	{ case_id: 40, case_name: 'Ransomware', timelines: [] }
];

describe('caseSelectionState', () => {
	it('is all when every timeline of the case is selected', () => {
		expect(caseSelectionState(cases[0], new Set([1, 2]))).toBe('all');
	});

	it('is some when only part of the timelines are selected', () => {
		expect(caseSelectionState(cases[0], new Set([2, 3]))).toBe('some');
	});

	it('is none when no timeline is selected, or the case has none', () => {
		expect(caseSelectionState(cases[0], new Set([3]))).toBe('none');
		expect(caseSelectionState(cases[2], new Set([1, 2, 3]))).toBe('none');
	});
});

describe('withCaseTimelines', () => {
	it('selects every timeline of the given cases, keeping the others', () => {
		expect([...withCaseTimelines(new Set([3]), [cases[0]], true)].sort()).toEqual([1, 2, 3]);
	});

	it('deselects every timeline of the given cases, keeping the others', () => {
		expect([...withCaseTimelines(new Set([1, 2, 3]), [cases[0]], false)]).toEqual([3]);
	});

	it('does not mutate the given selection', () => {
		const selected = new Set([3]);
		withCaseTimelines(selected, cases, true);
		expect([...selected]).toEqual([3]);
	});
});

describe('filterLinkedCases', () => {
	it('returns every case without a needle', () => {
		expect(filterLinkedCases(cases, '  ')).toHaveLength(3);
	});

	it('matches the case number, with or without #', () => {
		expect(filterLinkedCases(cases, '#356').map((c) => c.case_id)).toEqual([3566]);
		expect(filterLinkedCases(cases, '12').map((c) => c.case_id)).toEqual([12]);
	});

	it('matches the name without its stored number, case-insensitively', () => {
		expect(filterLinkedCases(cases, 'PHISH').map((c) => c.case_id)).toEqual([12]);
		expect(filterLinkedCases(cases, 'ransom').map((c) => c.case_id)).toEqual([40]);
	});
});
