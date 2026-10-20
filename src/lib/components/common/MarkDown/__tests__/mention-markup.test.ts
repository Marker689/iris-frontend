import { describe, expect, it } from 'vitest';
import { buildMentionSpan, findMentionSpans, readTagAttributes } from '../mention-markup';

/** What `build_mention_span('alert', 106, 'Alert #106')` writes in iris-backend. */
const BACKEND_ALERT_CHIP =
	'<span data-mention data-kind="alert" data-id="106" data-label="Alert #106">#Alert #106</span>';

/** The longer shape TipTap stored for chips authored outside collab. */
const TIPTAP_CHIP =
	'<span class="mention-chip mention-chip-clickable bg-orange-500/15" data-mention ' +
	'data-kind="alert" data-id="7" data-label="Alert #7" role="button" tabindex="0">' +
	'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">' +
	'<path d="M12 2 L22 22 H2 Z"></path></svg>' +
	'<span class="mention-chip-label">Alert #7</span></span>';

describe('buildMentionSpan', () => {
	it('writes exactly what the backend writes for an alert', () => {
		expect(buildMentionSpan('alert', 106, 'Alert #106')).toBe(BACKEND_ALERT_CHIP);
	});

	it('uses @ for users and teams', () => {
		expect(buildMentionSpan('user', '42', 'John Doe')).toBe(
			'<span data-mention data-kind="user" data-id="42" data-label="John Doe">@John Doe</span>'
		);
		expect(buildMentionSpan('team', 3, 'SOC')).toBe(
			'<span data-mention data-kind="team" data-id="3" data-label="SOC">@SOC</span>'
		);
	});

	it('uses # for the other kinds', () => {
		for (const kind of ['asset', 'ioc', 'note', 'task', 'datastore', 'alert']) {
			expect(buildMentionSpan(kind, 1, 'x')).toBe(
				`<span data-mention data-kind="${kind}" data-id="1" data-label="x">#x</span>`
			);
		}
	});

	it('falls back to user for an unknown kind', () => {
		expect(buildMentionSpan('<script>', 1, 'Eve')).toBe(
			'<span data-mention data-kind="user" data-id="1" data-label="Eve">@Eve</span>'
		);
	});

	it('escapes the label and id like html.escape(quote=True)', () => {
		expect(buildMentionSpan('ioc', `1"&'`, `<b>"R&D"</b> 'x'`)).toBe(
			'<span data-mention data-kind="ioc" data-id="1&quot;&amp;&#x27;" ' +
				'data-label="&lt;b&gt;&quot;R&amp;D&quot;&lt;/b&gt; &#x27;x&#x27;">' +
				'#&lt;b&gt;&quot;R&amp;D&quot;&lt;/b&gt; &#x27;x&#x27;</span>'
		);
	});

	it('round-trips through findMentionSpans', () => {
		const label = `O'Brien & <Co> "quoted"`;
		const chip = buildMentionSpan('user', 'a&b', label);
		expect(findMentionSpans(chip)).toEqual([
			{ from: 0, to: chip.length, kind: 'user', id: 'a&b', label }
		]);
	});
});

describe('findMentionSpans', () => {
	it('finds a backend chip with its position, kind, id and label', () => {
		const text = `Escalated from ${BACKEND_ALERT_CHIP}.`;
		expect(findMentionSpans(text)).toEqual([
			{
				from: 15,
				to: 15 + BACKEND_ALERT_CHIP.length,
				kind: 'alert',
				id: '106',
				label: 'Alert #106'
			}
		]);
	});

	it('shifts positions by the offset', () => {
		const [span] = findMentionSpans(`x ${BACKEND_ALERT_CHIP}`, 100);
		expect(span.from).toBe(102);
		expect(span.to).toBe(102 + BACKEND_ALERT_CHIP.length);
	});

	it('finds every chip in order', () => {
		const a = buildMentionSpan('user', 1, 'Alice');
		const b = buildMentionSpan('asset', 2, 'host-01');
		const text = `${a} and ${b}`;
		const spans = findMentionSpans(text);
		expect(spans.map((s) => [s.kind, s.id, s.label])).toEqual([
			['user', '1', 'Alice'],
			['asset', '2', 'host-01']
		]);
		expect(text.slice(spans[0].from, spans[0].to)).toBe(a);
		expect(text.slice(spans[1].from, spans[1].to)).toBe(b);
	});

	it('reads the older TipTap shape with svg and a nested label span as one chip', () => {
		const text = `see ${TIPTAP_CHIP} now`;
		expect(findMentionSpans(text)).toEqual([
			{ from: 4, to: 4 + TIPTAP_CHIP.length, kind: 'alert', id: '7', label: 'Alert #7' }
		]);
	});

	it('takes the label from the body, minus the trigger char, when data-label is missing', () => {
		const chip = '<span data-mention data-kind="user" data-id="5">@Jane &amp; Co</span>';
		expect(findMentionSpans(chip)).toEqual([
			{ from: 0, to: chip.length, kind: 'user', id: '5', label: 'Jane & Co' }
		]);
	});

	it('takes the label from a nested label span when data-label is missing', () => {
		const chip =
			'<span data-mention data-kind="task" data-id="9" class="mention-chip">' +
			'<svg viewBox="0 0 24 24"><path d="M1 1"></path></svg>' +
			'<span class="mention-chip-label">Collect logs</span></span>';
		expect(findMentionSpans(chip)[0]).toMatchObject({
			kind: 'task',
			id: '9',
			label: 'Collect logs'
		});
	});

	it('falls back to user for an unknown or missing kind', () => {
		expect(
			findMentionSpans(
				'<span data-mention data-kind="planet" data-id="1" data-label="Mars">#Mars</span>'
			)[0].kind
		).toBe('user');
		expect(
			findMentionSpans('<span data-mention data-id="1" data-label="Bob">@Bob</span>')[0].kind
		).toBe('user');
	});

	it('gives an empty id when data-id is missing', () => {
		expect(
			findMentionSpans('<span data-mention data-kind="user" data-label="Bob">@Bob</span>')[0].id
		).toBe('');
	});

	it('does not match a chip that spans lines', () => {
		expect(
			findMentionSpans(
				'<span data-mention data-kind="user" data-id="1" data-label="Bob">@Bob\n</span>'
			)
		).toEqual([]);
	});

	it('still finds a chip on the line after one that spans lines', () => {
		const broken = '<span data-mention data-kind="user" data-id="1" data-label="A">@A\n</span>\n';
		const spans = findMentionSpans(`${broken}${BACKEND_ALERT_CHIP}`);
		expect(spans).toHaveLength(1);
		expect(spans[0]).toMatchObject({ from: broken.length, id: '106' });
	});

	it('skips an unclosed chip', () => {
		expect(findMentionSpans('<span data-mention data-kind="user" data-id="1">@Bob')).toEqual([]);
	});

	it('ignores spans without data-mention', () => {
		expect(findMentionSpans('<span class="x" data-kind="user">@Bob</span>')).toEqual([]);
	});

	it('finds nothing in plain text', () => {
		expect(findMentionSpans('Hello @Bob, see #42')).toEqual([]);
	});
});

describe('readTagAttributes', () => {
	it('reads double-quoted, single-quoted, unquoted and bare attributes', () => {
		expect(
			readTagAttributes(`<span data-mention data-kind="alert" data-id='12' data-label=Foo>`)
		).toEqual({
			'data-mention': '',
			'data-kind': 'alert',
			'data-id': '12',
			'data-label': 'Foo'
		});
	});

	it('unescapes values', () => {
		expect(
			readTagAttributes(
				'<span data-label="&lt;R&amp;D&gt; &quot;a&quot; &#x27;b&#39; &apos;c&apos;">'
			)
		).toEqual({ 'data-label': `<R&D> "a" 'b' 'c'` });
	});

	it('lowercases attribute names but not values', () => {
		expect(readTagAttributes('<SPAN Data-Kind="Alert">')).toEqual({ 'data-kind': 'Alert' });
	});

	it('keeps spaces and = inside quoted values', () => {
		expect(readTagAttributes('<a title="a = b c" href="x">')).toEqual({
			title: 'a = b c',
			href: 'x'
		});
	});

	it('handles a self-closing tag', () => {
		expect(readTagAttributes('<img src="a.png" alt="A" width="200"/>')).toEqual({
			src: 'a.png',
			alt: 'A',
			width: '200'
		});
		expect(readTagAttributes('<img src="a.png" />')).toEqual({ src: 'a.png' });
	});

	it('returns nothing for a tag without attributes', () => {
		expect(readTagAttributes('<span>')).toEqual({});
	});
});
