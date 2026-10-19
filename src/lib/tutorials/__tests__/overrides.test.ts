import { describe, expect, it } from 'vitest';
import type { CustomTutorial } from '$lib/services/tutorials.service';
import { TUTORIALS } from '..';
import { buildCatalogue, forAudience, startSource } from '../overrides';
import type { Tutorial } from '../types';

const builtIn = (id: string, extra: Partial<Tutorial> = {}): Tutorial => ({
	id,
	title: id,
	summary: '',
	duration: '~1 min',
	steps: [{ title: 'Only step', body: '' }],
	...extra
});

const row = (id: number, extra: Partial<CustomTutorial> = {}): CustomTutorial => ({
	id,
	title: `Row ${id}`,
	summary: 'Edited',
	duration: '~2 min',
	steps: [{ title: 'Edited step', body: '' }],
	published: true,
	builtin_id: null,
	created_at: '',
	updated_at: '',
	...extra
});

describe('buildCatalogue', () => {
	const builtIns = [builtIn('a'), builtIn('b'), builtIn('c', { audience: 'administrators' })];

	it('lists the built-ins as shipped without rows', () => {
		expect(buildCatalogue(builtIns, [])).toEqual({ builtIn: builtIns, team: [] });
	});

	it('replaces a built-in with its published version, keeping its id and audience', () => {
		const { builtIn: list } = buildCatalogue(builtIns, [
			row(1, { builtin_id: 'c', title: 'Our way' })
		]);
		expect(list.map((t) => t.id)).toEqual(['a', 'b', 'c']);
		expect(list[2]).toEqual({
			id: 'c',
			title: 'Our way',
			summary: 'Edited',
			duration: '~2 min',
			steps: [{ title: 'Edited step', body: '' }],
			audience: 'administrators'
		});
	});

	it('hides a built-in whose version is unpublished', () => {
		const { builtIn: list } = buildCatalogue(builtIns, [
			row(1, { builtin_id: 'a', published: false, steps: [] })
		]);
		expect(list.map((t) => t.id)).toEqual(['b', 'c']);
	});

	it('lists the published tutorials of the team apart', () => {
		const { builtIn: list, team } = buildCatalogue(builtIns, [
			row(4),
			row(5, { published: false }),
			row(6, { builtin_id: 'gone' })
		]);
		expect(list).toEqual(builtIns);
		expect(team.map((t) => t.id)).toEqual(['custom-4']);
	});
});

describe('forAudience', () => {
	it('keeps administrator tutorials for administrators', () => {
		const list = [builtIn('a'), builtIn('b', { audience: 'administrators' })];
		expect(forAudience(list, false).map((t) => t.id)).toEqual(['a']);
		expect(forAudience(list, true)).toEqual(list);
	});
});

describe('startSource', () => {
	it('starts a bundled tutorial by id, anything else by definition', () => {
		const shipped = TUTORIALS[0];
		expect(startSource(shipped)).toBe(shipped.id);
		const edited = { ...shipped, title: 'Edited' };
		expect(startSource(edited)).toBe(edited);
	});
});
