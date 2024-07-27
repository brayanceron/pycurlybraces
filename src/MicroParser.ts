import { rgxIdentation, rgxNewBlock } from './regex';

class MicroParser {
    lineText: string; defaultAutoComplete: string; autoComplete: string;
    charBefore: string; twoCharBefore: string; lastCharacter: string;
    textAhead: string; tiggerChar: string;

    quotes: boolean; isBloque: boolean; behaviors: boolean;

    initInsertPos: number; commentPos: number;
    indexAbs: number; tabSize: number;
    position: number; line: number

    state: AnalysisStatus; action: Action;

    constructor(lineText: string, pos: number, tabsize: number, tiggerChar: string, behaviors = true) {
        this.lineText = lineText;
        this.initInsertPos = pos;
        this.tabSize = tabsize; this.state = AnalysisStatus.NotAnalyzed; this.action = Action.Nada;
        this.tiggerChar = tiggerChar;

        this.defaultAutoComplete = "";
        this.charBefore = ""; this.twoCharBefore = ""; this.textAhead = ""; this.lastCharacter = "";

        this.behaviors = behaviors; this.quotes = false; this.isBloque = false; this.autoComplete = ""
        this.commentPos = -1; this.indexAbs = -2; this.position = -1; this.line = -1;
    }

    getLastCharacteres(text: string, cutText = 0, cutResult = 0) {
        let last = "";
        let iteration = 0;
        let countCutResult = 0;
        for (let i = (text.length - 1); i >= 0; i--) {
            iteration = iteration + 1;
            if (iteration <= cutText) continue;
            const item = text[i];
            if (item !== " ") {
                countCutResult = countCutResult + 1;
                if (countCutResult <= cutResult) continue;
                last += item;
            }
            if (last.length !== 0 && item === " ") break;
            // iteration = iteration + 1;
        }
        return last;
    }
    isClosedBrackets(text: string): { closedBrackets: boolean, commentPos: number } {
                              /*0    1    2    3    4    5    6    7 */
        const brackets: any = ['{', '}', '[', ']', '(', ')', '"', "'"];
        let stack: string[] = [];
        const indexLimit = brackets.indexOf('"');;

        for (let i = 0; i < text.length; i++) {
            let item;
            let index;
            let first = 0;

            if (this.quotes === false && text[i] === '#') { this.commentPos = i; break; }
            if (brackets.includes(text[i])) {
                item = text[i];
                index = brackets.indexOf(item);
                this.indexAbs = index;

                if (this.indexAbs >= indexLimit) {
                    index = this.quotes ? 1 : 0;
                    first = first + 1;
                }
            }

            if (!item) continue;
            let pair = index % 2

            if (pair === 0) {
                if (this.quotes === false && first === 1) { stack.push(item); this.quotes = this.quotes ? false : true; continue; } // this only when the first quotation mark is found
                if (this.quotes === true) continue;
                stack.push(item);
            }
            else if (pair !== 0) {
                if (this.quotes === true && stack[stack.length - 1] !== item) continue;
                let value = stack.pop();
                let reverse = (pair === 0) ? index + 1 : index - 1;
                if (this.indexAbs >= indexLimit) reverse = this.indexAbs
                if (value !== brackets[reverse]) return { closedBrackets: false, commentPos: this.commentPos };
            }

            if (this.indexAbs >= indexLimit) this.quotes = this.quotes ? false : true;
        }

        if (stack.length === 0) return { closedBrackets: true, commentPos: this.commentPos };

        return { closedBrackets: false, commentPos: this.commentPos };
    }
    setAutoComplete(): { backPos: boolean } {
        let charBeforeAux = this.getLastCharacteres(this.lineText, 0, this.tiggerChar.length);

        this.autoComplete = `:#` + this.defaultAutoComplete; //case2
        this.isBloque = true;

        if (charBeforeAux[0] === ':') this.autoComplete = `#` + this.defaultAutoComplete; //case3
        if (this.charBefore === '#') {
            this.autoComplete = this.defaultAutoComplete; //case4
            if (this.lastCharacter[0] !== ":") { //case1
                this.autoComplete = `:#` + this.defaultAutoComplete;
                return { backPos: true }
            }
        }
        return { backPos: false }
    }

    setState(newState: AnalysisStatus = AnalysisStatus.NotAnalyzed, newAction: Action = Action.Nada) { this.state = newState; this.action = newAction; }
    analize(position: number) {
        if (!this.behaviors) return this.setState(AnalysisStatus.NotAnalyzed, Action.Abort);
        this.position = position;

        if (this.position >= 1) this.charBefore = this.lineText[this.position - 1];
        if (this.position >= 2) this.twoCharBefore = this.lineText[this.position - 2];

        if (!this.charBefore) return this.setState(AnalysisStatus.Error, Action.Abort); 

        let { spaceString: spacesString } = MicroParser.identationSpaces(this.lineText);

        //=============================

        this.defaultAutoComplete = `{\n${spacesString}${MicroParser.identationSpaces(this.lineText, this.tabSize).spaceString}pass\n${spacesString}#}`;

        if (this.twoCharBefore === '\\' && this.charBefore === '#') return this.setState(AnalysisStatus.Error, Action.Abort);  // escape pattern

        this.textAhead = this.lineText.substring(this.position).substring(this.tiggerChar.length).trim();
        if (this.textAhead.length !== 0) return this.setState(AnalysisStatus.Invalid, Action.Abort); 

        this.lastCharacter = this.getLastCharacteres(this.lineText, 0, (this.tiggerChar.length + 1)); //cutText = 0, cutResult = 3

        // if (this.charBefore === '#') this.autoComplete = this.defaultAutoComplete; //traditional autocomplete
        if (this.newBlockPycurlybraces()) {
            this.autoComplete = "#" + this.defaultAutoComplete;
            this.isBloque = true;
            this.initInsertPos = spacesString.length - 1 >= 0 ? spacesString.length : 0;
            return this.setState(AnalysisStatus.Ok, Action.ContinueSimple);
        }

        //INLINEA STRUCTURE
        const { closedBrackets, commentPos } = this.isClosedBrackets(this.lineText.substring(0, position));
        if (rgxIdentation.test(this.lineText)) {
            if (commentPos >= 0 && this.position - 1 > commentPos) { this.autoComplete = ''; return this.setState(AnalysisStatus.Invalid, Action.Abort); }
            if (!closedBrackets) return this.setState(AnalysisStatus.Error, Action.Abort);

            const { backPos } = this.setAutoComplete();
            // if (!this.isBloque) return;
            this.initInsertPos = (backPos) ? (this.position - 1) : this.initInsertPos;
            return this.setState(AnalysisStatus.Ok, Action.ContinueInLine);
        }

        //there must be an extra ')'
        if (!closedBrackets) return this.setState(AnalysisStatus.NotFound, Action.TryMultiline);
        return this.setState(AnalysisStatus.NotFound, Action.Abort);
    }
    newBlockPycurlybraces(): boolean {
        if (rgxNewBlock.test(this.lineText))  return true; 
        return false;
    }

    static identationSpaces(lineText: string, generateSpaces: number = 0): { spaceString: string, spaces: number } {
        let spaceString = '';
        if (generateSpaces > 0) {
            for (let j = 0; j < generateSpaces; j++) { spaceString += ' '; }
            return { spaceString, spaces: spaceString.length };
        }
        for (let char of lineText) {
            if (char === ' ') spaceString += ' ';//if (char === '\t') 
            else break;
        }
        return { spaceString, spaces: spaceString.length };
    }

}

enum AnalysisStatus { NotAnalyzed, Error, Ok, Invalid, NotFound };
enum Action { TryMultiline, ContinueInLine, ContinueSimple, ContinueInLineInvalid, Nada, Abort };

export { MicroParser, AnalysisStatus, Action };