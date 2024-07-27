const rgxIdentation: RegExp = /^\s*(def|class|if|else|elif|while|for|try|except|finally|with|match|case)\b.*$/;

const rgxMultiline: RegExp = /.*\)\s*:?\s*#?(\{|\{\}|\{\})\s*$/  //Check that the line is not a comment
// const rgxMultiline: RegExp = /.*\)\s*:?\s*(\{|\{\})\s*$/  //Check that the line is not a comment
// const rgxMultiline = /^(?!.*\s*(def|class|if|else|elif|while|for|try|except|finally|with|match|case)).*\)\s*:?\s*(\{|\{\})\s*$/   //Check that the line is not a comment
// const rgxMultilineComment=/.*("""|''').*\s*:?\s*$/ //It is a very ambiguous and complex case

const rgxPycurlybraces = /(?<!\\)#(\{|\})|:\s*\#{/g; // let rgxPycurlybraces = /(?<!\\)#(\{|\})|{/g;

const rgxComment = /^\s*#[^{}].*$/ // const regexComment=/^\s*#.*$/
// const rgxComment = /\s*#.*/
// const rgxComment = /\s*#[^\{\}].*/
// const rgxComment = /\s*#.*/

const rgxColonRange = /^.{0,2}:\s*#?$/g;	// const rgxColonRange = /^..?:\s*#?\{?/g;
const rgxValidColonExpresion = /^.{0,2}:\s*(#\{.*|\s*)$/g;

const rgxNewBlock = /^\s*#\{\}?\s*$/ // /\s*#(\{|\{\})\s*$/

export { rgxIdentation, rgxMultiline, rgxPycurlybraces, rgxComment, rgxColonRange, rgxValidColonExpresion, rgxNewBlock }