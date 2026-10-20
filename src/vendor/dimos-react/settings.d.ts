export type SettingKind = "bool" | "enum" | "integer" | "number" | "string" | "path" | "json";
/** What <SettingInput> needs to know about a setting. */
export interface SettingField {
    name: string;
    kind: SettingKind;
    /** null (an empty box) is a value */
    nullable?: boolean;
    /** an enum's values */
    options?: unknown[];
    /** an enum's labels, by option */
    optionLabels?: string[];
    /** a password box (with show / hide) */
    secret?: boolean;
    placeholder?: string;
}
/** What a gateway sends in place of a saved secret. */
export declare const HIDDEN_SECRET = "\u2022\u2022\u2022";
/** Equal as JSON (null and undefined alike). */
export declare const sameValue: (a: unknown, b: unknown) => boolean;
export type JsonSchema = Record<string, any>;
/** A schema with its $ref followed and an optional (anyOf [T, null]) unwrapped to T. */
export declare function resolveSchema(schema: JsonSchema, root?: JsonSchema): JsonSchema;
/** Whether a schema takes null. */
export declare const schemaNullable: (schema: JsonSchema) => boolean;
/** The input a (resolved) schema takes; "json" for anything without a typed input. */
export declare function schemaKind(schema: JsonSchema): SettingKind;
/** The input a Python annotation (`int`, `str | None`, `Optional[Path]`) takes; "json" for anything else. */
export declare function pythonTypeKind(type: string | null | undefined): {
    kind: SettingKind;
    nullable: boolean;
};
/** A value as the text in its box ("" for none; JSON for anything not a string). */
export declare const settingText: (value: unknown) => string;
/** A value as a person reads it ("—" for none, "" quoted). */
export declare const settingLabel: (value: unknown) => string;
/** The value typed text means for this setting, or what it should have been. */
export declare function parseSettingText(field: Pick<SettingField, "kind" | "nullable">, text: string): {
    value: unknown;
} | {
    error: string;
};
