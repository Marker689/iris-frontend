/**
 * Case names are stored with their number ("#3566 - Hunt for …"). Where the
 * number is already shown next to the name, show the bare name instead.
 */
export const caseNameWithoutNumber = (name: string | null | undefined): string => {
	const value = name ?? '';
	return value.match(/^#\d+\s*-\s*(.+)$/)?.[1] ?? value;
};

/** "#3566 Hunt for …", never "#3566 #3566 - Hunt for …". */
export const caseNumberedName = (caseId: number, name: string | null | undefined): string => {
	const bare = caseNameWithoutNumber(name);
	return bare ? `#${caseId} ${bare}` : `#${caseId}`;
};
