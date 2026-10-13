/**
 * The arguments of a tool, read from its JSON input schema, for the
 * Action and Suggest node forms.
 */

export type ToolArgument = {
	name: string;
	/** `string`, `integer`, `array of integer`, … ('' when the schema says nothing). */
	type: string;
	required: boolean;
	description: string;
	/** The allowed values, when the schema lists them. */
	values: unknown[] | null;
	/** The fields of an object argument. */
	fields: ToolArgument[];
	/** Where the run fills it from, when it does. */
	pinned: string | null;
};

type Schema = Record<string, unknown>;

// What `ai_workflows_agent_pin_arguments` sets from the run's entity (and
// overrides when the node gives another value).
const PINNED: Record<string, string> = {
	case_identifier: "Set to the run's case when it runs on a case.",
	war_room_id: "Set to the run's war room when it runs on a war room."
};
const PINNED_WRITE: Record<string, string> = {
	alert_identifier: "Set to the run's alert when it runs on an alert."
};

function asSchema(value: unknown): Schema {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Schema) : {};
}

function typeOf(spec: Schema): string {
	const type = spec.type;
	const name = Array.isArray(type) ? type.join(' | ') : typeof type === 'string' ? type : '';
	const items = asSchema(spec.items);
	return name === 'array' && typeof items.type === 'string' ? `array of ${items.type}` : name;
}

function fieldsOf(schema: Schema, pinned: Record<string, string>): ToolArgument[] {
	const properties = asSchema(schema.properties);
	const required = new Set(Array.isArray(schema.required) ? schema.required : []);
	return Object.entries(properties).map(([name, value]) => {
		const spec = asSchema(value);
		return {
			name,
			type: typeOf(spec),
			required: required.has(name),
			description: typeof spec.description === 'string' ? spec.description : '',
			values: Array.isArray(spec.enum) ? spec.enum : null,
			fields: fieldsOf(spec, {}),
			pinned: pinned[name] ?? null
		};
	});
}

/** The arguments of a tool, as its input schema describes them. */
export function toolArguments(schema: unknown, classification?: string): ToolArgument[] {
	const pinned = classification === 'write' ? { ...PINNED, ...PINNED_WRITE } : PINNED;
	return fieldsOf(asSchema(schema), pinned);
}

function fill(current: Record<string, unknown>, fields: ToolArgument[]) {
	const out: Record<string, unknown> = { ...current };
	for (const field of fields) {
		if (!field.required) continue;
		const value = out[field.name];
		const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
		if (field.fields.length && (value === undefined || isObject)) {
			out[field.name] = fill(isObject ? (value as Record<string, unknown>) : {}, field.fields);
		} else if (value === undefined) {
			out[field.name] = field.type.startsWith('array') ? [] : null;
		}
	}
	return out;
}

/**
 * `current` with the required arguments it lacks (null, or an empty
 * list / object to fill in), keeping every value it already has. The
 * run sets the ones it pins over the null.
 */
export function toolArgumentsSkeleton(
	current: unknown,
	schema: unknown,
	classification?: string
): Record<string, unknown> {
	return fill(asSchema(current), toolArguments(schema, classification));
}
