/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
	pipe: 1,
	or: 2,
	and: 3,
	cmp: 4,
	add: 5,
	mul: 6,
	pow: 7,
	prefix: 8,
	postfix: 9,
};
const commaSep = (rule) =>
	optional(seq(rule, repeat(seq(",", rule)), optional(",")));

module.exports = grammar({
	name: "kcl",
	extras: ($) => [/\s/, $.comment, $.block_comment],
	word: ($) => $.identifier,
	conflicts: ($) => [[$.type_name, $._expr]],
	rules: {
		kcl_program: ($) =>
			seq(optional($.shebang), repeat(choice($.annotation, $.body_item))),
		shebang: (_) => /#![^\n]*/,
		body_item: ($) =>
			choice(
				$.variable_declaration,
				$.return_stmt,
				$.import_stmt,
				$.type_declaration,
				$.expr_stmt,
			),
		variable_declaration: ($) =>
			seq(optional("export"), choice($.fn_definition, $.non_fn_definition)),
		non_fn_definition: ($) =>
			seq(field("name", $.identifier), "=", field("value", $._expr)),
		fn_definition: ($) =>
			seq(
				"fn",
				field("name", $.identifier),
				field("parameters", $.param_list),
				optional(seq(choice(":", "?:"), $.type_name)),
				field("body", $.function_body),
			),
		fn_expression: ($) =>
			seq(
				"fn",
				field("parameters", $.param_list),
				optional(seq(choice(":", "?:"), $.type_name)),
				field("body", $.function_body),
			),
		function_body: ($) =>
			seq("{", repeat(choice($.annotation, $.body_item)), "}"),
		param_list: ($) => seq("(", commaSep($.param), ")"),
		param: ($) =>
			seq(
				repeat($.annotation),
				optional("@"),
				field("name", $.identifier),
				optional("?"),
				optional(seq(":", field("type", $.type_name))),
				optional(seq("=", field("default", $._expr))),
			),
		type_name: ($) =>
			prec.right(seq($._one_type, repeat(seq("|", $._one_type)))),
		_one_type: ($) =>
			choice(
				seq(
					choice($.identifier, $.namespace_expr),
					optional(seq("(", choice($.identifier, "_"), ")")),
					optional("[]"),
				),
				$.array_type,
				$.function_type,
				$.object_type,
			),
		array_type: ($) =>
			seq(
				"[",
				$.type_name,
				optional(seq(";", field("length", $.number), optional("+"))),
				"]",
			),
		function_type: ($) =>
			seq("fn", "(", commaSep($.type_name), ")", ":", $._one_type),
		object_type: (_) => seq("{", "}"),
		type_declaration: ($) =>
			prec.right(
				seq(
					optional("export"),
					"type",
					field("name", $.identifier),
					optional(seq("(", commaSep($.identifier), ")")),
					optional(seq("{", repeat($.enum_variant), "}")),
				),
			),
		enum_variant: ($) =>
			seq("|", field("name", $.identifier), optional($.param_list)),
		import_stmt: ($) =>
			seq(
				"import",
				choice(
					seq(
						field("source", $.string),
						optional(seq("as", field("alias", $.identifier))),
					),
					seq(
						choice(commaSep1($.import_item), "*"),
						"from",
						field("source", $.string),
					),
				),
			),
		import_item: ($) =>
			seq(
				field("name", $.identifier),
				optional(seq("as", field("alias", $.identifier))),
			),
		annotation: ($) =>
			prec.right(
				seq(
					"@",
					choice(
						seq("(", commaSep($.annotation_kv), ")"),
						seq(
							field("name", $.identifier),
							optional(seq("(", commaSep($.annotation_kv), ")")),
						),
					),
				),
			),
		annotation_kv: ($) =>
			seq(field("key", $.identifier), "=", field("value", $._expr)),
		identifier: (_) => /[a-zA-Z_][a-zA-Z0-9_]*/,
		expr_stmt: ($) => $._expr,
		return_stmt: ($) => seq("return", $._expr),
		_expr: ($) =>
			choice(
				$.identifier,
				$.number,
				$.string,
				$.boolean,
				$.array_expr,
				$.object_expr,
				$.parenthesized_expr,
				$.fn_call,
				$.member_expr,
				$.index_expr,
				$.namespace_expr,
				$.sketch_expr,
				$.fn_expression,
				$.if_expr,
				$.binary_expr,
				$.prefix_expr,
				$.var_expr,
				$.tag,
				$.pipe_sub,
			),
		array_expr: ($) => seq("[", commaSep(choice($._expr, $.range_expr)), "]"),
		range_expr: ($) =>
			seq(field("start", $._expr), "..", field("end", $._expr)),
		object_expr: ($) => seq("{", commaSep($.object_property), "}"),
		object_property: ($) =>
			seq(
				field("key", choice($.identifier, $.string)),
				"=",
				field("value", $._expr),
			),
		parenthesized_expr: ($) => seq("(", $._expr, ")"),
		fn_call: ($) =>
			prec(
				PREC.postfix,
				seq(
					field(
						"callee",
						choice(
							$.identifier,
							$.namespace_expr,
							$.member_expr,
							$.index_expr,
							$.parenthesized_expr,
						),
					),
					field("arguments", $.argument_list),
				),
			),
		argument_list: ($) =>
			seq(
				"(",
				commaSep(choice(field("unlabeledArg", $._expr), $.labeledArg)),
				")",
			),
		labeledArg: ($) =>
			seq(field("label", $.identifier), "=", field("arg", $._expr)),
		member_expr: ($) =>
			prec.left(
				PREC.postfix,
				seq(field("object", $._expr), ".", field("property", $.identifier)),
			),
		index_expr: ($) =>
			prec.left(
				PREC.postfix,
				seq(field("object", $._expr), "[", field("index", $._expr), "]"),
			),
		namespace_expr: ($) =>
			prec.left(
				PREC.postfix,
				seq(
					field("namespace", choice($.identifier, $.namespace_expr)),
					"::",
					field("name", $.identifier),
				),
			),
		sketch_expr: ($) =>
			seq(
				"sketch",
				field("arguments", $.argument_list),
				field("body", $.sketch_body),
			),
		sketch_body: ($) =>
			seq("{", repeat(choice($.annotation, $.body_item)), "}"),
		var_expr: ($) => prec(PREC.prefix, seq("var", $._expr)),
		tag: ($) => seq("$", $.identifier),
		pipe_sub: (_) => "%",
		if_expr: ($) =>
			seq(
				"if",
				field("condition", $._expr),
				field("if_clause", $.function_body),
				repeat(
					seq(
						"else",
						"if",
						field("condition", $._expr),
						field("else_if_clause", $.function_body),
					),
				),
				"else",
				field("else_clause", $.function_body),
			),
		prefix_expr: ($) =>
			prec(
				PREC.prefix,
				seq(field("operator", $.prefix_operator), field("operand", $._expr)),
			),
		prefix_operator: (_) => choice("!", "-", "+"),
		binary_expr: ($) =>
			choice(
				...[
					[PREC.pipe, "|>"],
					[PREC.or, "|"],
					[PREC.and, "&"],
					[PREC.cmp, choice("==", "!=", ">", ">=", "<", "<=")],
					[PREC.add, choice("+", "-")],
					[PREC.mul, choice("*", "/", "%")],
				].map(([level, op]) =>
					prec.left(
						level,
						seq(
							field("lhs", $._expr),
							field("operator", alias(op, $.binary_operator)),
							field("rhs", $._expr),
						),
					),
				),
				prec.right(
					PREC.pow,
					seq(
						field("lhs", $._expr),
						field("operator", alias("^", $.binary_operator)),
						field("rhs", $._expr),
					),
				),
			),
		binary_operator: (_) =>
			choice(
				"+",
				"-",
				"*",
				"/",
				"%",
				"^",
				"==",
				"!=",
				">",
				">=",
				"<",
				"<=",
				"|",
				"&",
				"|>",
			),
		number: ($) =>
			seq(
				token(/(?:[0-9]+\.[0-9]+|[0-9]+)(?:[eE][+-]?[0-9]+)?/),
				optional(field("unit", $.unit)),
			),
		unit: (_) =>
			token.immediate(
				choice("mm", "cm", "m", "in", "ft", "yd", "deg", "rad", "_"),
			),
		boolean: (_) => choice("true", "false"),
		string: ($) =>
			choice(
				seq(
					'"',
					repeat(choice(token.immediate(/[^"\\\n]+/), $.escape_sequence)),
					'"',
				),
				seq(
					"'",
					repeat(choice(token.immediate(/[^'\\\n]+/), $.escape_sequence)),
					"'",
				),
			),
		escape_sequence: (_) =>
			token.immediate(/\\(?:["'\\/bfnrt]|u[0-9a-fA-F]{4})/),
		comment: (_) => token(/\/\/[^\n]*(?:\n[ \t]*\/\/[^\n]*)*/),
		block_comment: (_) => token(seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),
	},
});
function commaSep1(rule) {
	return seq(rule, repeat(seq(",", rule)));
}
