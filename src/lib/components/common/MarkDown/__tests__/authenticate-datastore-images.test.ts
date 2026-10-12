import { describe, expect, it } from 'vitest';
import { parseDatastoreUrl } from '../authenticate-datastore-images';

describe('parseDatastoreUrl', () => {
	it('recognises a case datastore file', () => {
		expect(parseDatastoreUrl('/api/v2/cases/42/datastore/files/7')).toEqual({
			kind: 'case',
			ownerId: 42,
			fileId: 7
		});
	});

	it('recognises an absolute case datastore URL', () => {
		expect(parseDatastoreUrl('https://iris.example.org/api/v2/cases/42/datastore/files/7')).toEqual(
			{ kind: 'case', ownerId: 42, fileId: 7 }
		);
	});

	it('recognises a war-room datastore file', () => {
		expect(parseDatastoreUrl('/api/v2/war-rooms/3/datastore/12/content')).toEqual({
			kind: 'war-room',
			ownerId: 3,
			fileId: 12
		});
	});

	it('ignores war-room file metadata and other URLs', () => {
		expect(parseDatastoreUrl('/api/v2/war-rooms/3/datastore/12')).toBeNull();
		expect(parseDatastoreUrl('/api/v2/cases/42/datastore/files/7/extra')).toBeNull();
		expect(parseDatastoreUrl('https://example.org/image.png')).toBeNull();
	});
});
