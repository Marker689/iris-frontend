import { describe, expect, it } from 'vitest';
import { caseNameWithoutNumber, caseNumberedName } from '../case-name';

describe('caseNameWithoutNumber', () => {
	it('strips the stored case number', () => {
		expect(caseNameWithoutNumber('#3566 - Hunt for Remote Access')).toBe('Hunt for Remote Access');
	});

	it('keeps names without a number', () => {
		expect(caseNameWithoutNumber('Hunt for Remote Access')).toBe('Hunt for Remote Access');
		expect(caseNameWithoutNumber('#3566')).toBe('#3566');
	});

	it('handles missing names', () => {
		expect(caseNameWithoutNumber(null)).toBe('');
		expect(caseNameWithoutNumber(undefined)).toBe('');
	});
});

describe('caseNumberedName', () => {
	it('shows the number once', () => {
		expect(caseNumberedName(3566, '#3566 - Hunt')).toBe('#3566 Hunt');
		expect(caseNumberedName(3566, 'Hunt')).toBe('#3566 Hunt');
	});

	it('falls back to the number alone', () => {
		expect(caseNumberedName(3566, null)).toBe('#3566');
	});
});
