import * as vscode from 'vscode';
import { rgxIdentation, rgxPycurlybraces, rgxComment} from './regex'
import { Action, AnalysisStatus, MicroParser } from './MicroParser'

export async function activate(context: vscode.ExtensionContext) {
	let fontStyle = vscode.window.createTextEditorDecorationType({
		opacity: "0.01",// opacity: "0.25",
		fontStyle: "normal"
	});

	function getRenderOptions(character: string, foregroundSize: number, isSingleLine: boolean = false) {
		const foreground = (foregroundSize % 3) + 1;
		let options = {
			contentText: character,
			color: new vscode.ThemeColor(`editorBracketHighlight.foreground${foreground}`),// color:"red",			// backgroundColor: "yellow",
			fontStyle: "normal",															// fontWeight:"bold",	
			width: "0",
			margin: "0"
		}

		if (isSingleLine) {
			const renderOptions = { before: options }
			return renderOptions;
		}
		else {
			options.margin = "0 -1em";
			options.width = "2em"
			const renderOptions = { after: options }
			return renderOptions;
		}
	}

	// VARIABLES
	let editor = vscode.window.activeTextEditor!;
	const tabSize = parseInt(editor.options.tabSize!.toString()!);
	let regexPycurlybraces = rgxPycurlybraces;
	let pycurlybraces: vscode.Range[] = [];
	let isEditing = false;

	// function to update styles
	function updateDecorations() {
		if (!editor || editor.document.languageId !== 'python') return;
		if (!onRendering) return;
		let specificStringDecorations = [];
		pycurlybraces = [];
		const text = editor.document.getText();

		let match;
		while ((match = regexPycurlybraces.exec(text)) !== null) {
			let char: string = "";

			if (match[0].includes('}')) { char = '}' }
			if (match[0].includes('{')) { char = '{' }

			const startPos = editor.document.positionAt(match.index);
			const endPos = editor.document.positionAt((match.index) + match[0].length);

			const startLineText = editor.document.lineAt(startPos.line).text;
			if (rgxComment.test(startLineText)) continue;
			const { spaces: startTabs } = MicroParser.identationSpaces(startLineText);

			const isSingleLine = (startPos.line === endPos.line) ? true : false;

			pycurlybraces.push(new vscode.Range(startPos, endPos));
			if (onCursorOver) {
				if (currentLinePycurlybraces === startPos.line || currentLinePycurlybraces === endPos.line) continue;
			}

			specificStringDecorations.push({
				range: new vscode.Range(startPos, endPos),
				renderOptions: getRenderOptions(char, startTabs!, isSingleLine)
			});
		}

		editor.setDecorations(fontStyle, specificStringDecorations);
		console.log("UPDATE UP");
	}

	//-----------------------------------------------
	// COMMANDS
	let behaviors = true;
	let onCursorOver = true;
	let onRendering = true;
	let onRenderingCommand = vscode.commands.registerCommand('pycurlybraces.onRendering', async () => { await context.globalState.update("onRendering", true); onLoad(); })
	let offRenderingCommand = vscode.commands.registerCommand('pycurlybraces.offRendering', async () => { await context.globalState.update("onRendering", false); onLoad(); })
	let showColon = vscode.commands.registerCommand('pycurlybraces.showColon', async () => { await context.globalState.update("showColon", true); onLoad(); })
	let hideColon = vscode.commands.registerCommand('pycurlybraces.hideColon', async () => { await context.globalState.update("showColon", false); onLoad(); })
	let enableBehaviors = vscode.commands.registerCommand('pycurlybraces.enableBehaviors', async () => { await context.globalState.update("behaviors", true); onLoad(); })
	let disableBehaviors = vscode.commands.registerCommand('pycurlybraces.disableBehaviors', async () => { await context.globalState.update("behaviors", false); onLoad(); })
	let enableOnCursorOver = vscode.commands.registerCommand('pycurlybraces.enableOnCursorOver', async () => { await context.globalState.update("onCursorOver", true); currentLinePycurlybraces = -1; onLoad(); })
	let disableOnCursorOver = vscode.commands.registerCommand('pycurlybraces.disableOnCursorOver', async () => { await context.globalState.update("onCursorOver", false); onLoad(); })
	//-----------------------------------------------

	// Event for when the content of the document changes.
	const onDidChangeTextDocumentDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
		if (!editor || editor.document.languageId !== 'python') return;
		const changes = event.contentChanges;
		let parser: MicroParser;
		let key: string = '';
		let analysisOk = false;

		try {
			for (let i = 0; i < changes.length; i++) {
				let change = changes[i]
				const { start: startPos/* , end: endPos */ } = change.range;
				key = change.text;

				// BEHAVIORS
				if ((key === '{' || key === '{}' /* || key === '}' */)) {	// if (key.includes('{') || key.includes('}')) {
					let lineText = editor.document.lineAt(startPos.line).text;
					let position = change.range.start.character; // let position = change.range.end.character;
					parser = new MicroParser(lineText, position, tabSize, key, behaviors);
					if (!parser.behaviors) {
						if (position - 1 < 0) continue;
						if (key === '{}' && lineText[position - 1] === '#') vscode.commands.executeCommand('deleteRight');
						continue;
					}

					parser.analize(change.range.start.character);
					if (parser.textAhead.length !== 0) continue;

					//------------------------
					//Try Multiline
					let find = false;
					if (parser.action === Action.TryMultiline && parser.behaviors) {// if (!parser.isBloque && parser.behaviors) {
						let lineNumber = startPos.line - 1;
						let countLine = 0;
						let lines = [lineText];
						const { spaceString } = MicroParser.identationSpaces(lineText);

						while (lineNumber >= 0 && countLine < 30) {
							let backLineText = editor.document.lineAt(lineNumber).text;
							const tempLine = new MicroParser(backLineText, 0, tabSize, key);
							const { commentPos } = tempLine.isClosedBrackets(backLineText);

							if (commentPos >= 0) backLineText = backLineText.substring(0, commentPos);

							if (rgxIdentation.test(backLineText)) {
								lines.push(backLineText);
								find = true;
								break;
							}
							lines.push(backLineText);
							lineNumber--;
							countLine++;
						}
						if (find) {
							let lineTextAux = lineText;
							lineText = spaceString + lines.reverse().join();
							parser.lineText = lineText;
							let newPos = lineText.length - 1 - (editor.document.lineAt(startPos.line).text.length - 1 - change.range.start.character);
							parser.initInsertPos = newPos;

							parser.analize(newPos);
							let diff = parser.lineText.length - 1 - parser.initInsertPos;

							parser.initInsertPos = lineTextAux.length - 1 - diff;
							parser.lineText = lineTextAux;
						}
					}

					if (parser.state === AnalysisStatus.Ok) { analysisOk = true; isEditing = true; }
					else if (parser.state === AnalysisStatus.Invalid || parser.state === AnalysisStatus.Error || parser.state === AnalysisStatus.NotFound) {
						continue
						// if (parser.charBefore === "#") { vscode.commands.executeCommand('deleteRight'); } //something is missing here
					}  //this is when "{" comes alone without block structure or "#" behind it.

					//------------------------
					// INSERTING
					isEditing = true;
					await editor.edit(editBuilder => {
						editBuilder.insert(new vscode.Position(change.range.start.line, parser.initInsertPos), parser.autoComplete)
					})

					if (parser.state !== AnalysisStatus.Ok) isEditing = false;
					const endLine = editor.document.lineAt(startPos.line + 2).text;
					let idx = endLine.indexOf('#');

					await editor.edit(editBuilder => {
						const pos1 = new vscode.Position((startPos.line + 2), idx + 2)
						const pos2 = new vscode.Position((startPos.line + 2), endLine.length)
						editBuilder.delete(new vscode.Range(pos1, pos2));
					})

					if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document /* && key.length > 2 */) updateDecorations();
					isEditing = false;
				}
				else if (key.includes('#{') || key.includes('#}') || key.includes('#')) { //else if ( key.includes('#')) //This is for when a snippet is executed or when text is copied and pasted.
					if (!isEditing) {
						isEditing = true;
						updateDecorations();
					}
					isEditing = false;
				}
				if (change.rangeLength > 1 /* && key==='' */) { // this for when text is being deleted
					// if(startPos.line === endPos.line) return;
					if (!isEditing) {
						isEditing = true;
						updateDecorations();
					}
					isEditing = false;
				}

			}

			//moving the cursor
			if (analysisOk) { // if (parser!.state === AnalysisStatus.Ok) {
				vscode.commands.executeCommand('cursorMove', { to: 'up', by: 'line', value: 1 });
				vscode.commands.executeCommand('cursorMove', { to: 'right', by: 'line', value: (tabSize - "#}".length) });
				vscode.commands.executeCommand('cursorMove', { to: 'right', by: 'line', value: "pass".length, select: true });
			}

		} catch (error) {
			console.log("There was a mistake :("); //Error never occurs
		}
	});

	let currentLinePycurlybraces = -1;
	let onDidChangeTextEditorSelectionDisposable = vscode.window.onDidChangeTextEditorSelection(event => {
		if (!onCursorOver) return;
		if (!onRendering) return;

		if (isEditing) return;
		const newPosition = event.selections[0].active; // check when event.selections > 0
		const tempLine = newPosition.line;
		const tempCharacter = newPosition.character;

		let spaces = 2;
		try {
			let back = tempCharacter - (tempCharacter < spaces ? tempCharacter : spaces);
			const textRange = editor.document.getText(new vscode.Range(
				new vscode.Position(tempLine, back),
				new vscode.Position(tempLine, (tempCharacter + spaces))
			));

			// logic when the cursor changes position
			const rgxColonRange = /^.{0,2}:\s*#?$/g;
			if (textRange.includes('#{') || textRange.includes('#}')) {
				currentLinePycurlybraces = tempLine;
				updateDecorations();
			}
			else if (rgxColonRange.test(textRange)) { //Try updated for onCursorOver case2
				// if (tempLine === currentLinePycurlybraces) return;
				let lineText = editor.document.lineAt(tempLine).text

				for (let j = 0; j < pycurlybraces.length; j++) {
					if (pycurlybraces[j].start.line === tempLine) {
						let validColonText = lineText.substring(back);
						const rgxValidColonExpresion = /^.{0,2}:\s*(#\{.*|\s*)$/g;
						if (rgxValidColonExpresion.test(validColonText)) {
							currentLinePycurlybraces = tempLine;
							updateDecorations(); //updated for onCursorOver case2.1
							return;
						}
					}
				}

				let tmpCLP = currentLinePycurlybraces;
				currentLinePycurlybraces = -1;
				if (tmpCLP !== -1) {
					updateDecorations(); //updated for onCursorOver2.2
				}

			}
			else { //this is executed when the cursor leaves the pattern and needs to be hidden.
				if (currentLinePycurlybraces !== -1) {
					currentLinePycurlybraces = -1;
					updateDecorations(); //updated for onCursorOver case3
				}
				currentLinePycurlybraces = -1;
			}
		} catch (error) {
			console.log("There was a mistake :("); //Error never occurs
		}
		// console.log(`-- currentLinePycurlybraces: '${currentLinePycurlybraces}'`);
	});

	const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(event => {
		editor = vscode.window.activeTextEditor!;
		updateDecorations();
	});


	//------------------------------------------------------------------------
	context.subscriptions.push(
		onDidChangeTextDocumentDisposable,
		onDidChangeActiveTextEditor,
		onDidChangeTextEditorSelectionDisposable,
		onRenderingCommand,
		offRenderingCommand,
		showColon,
		hideColon,
		enableBehaviors,
		enableOnCursorOver,
		disableOnCursorOver,
		disableBehaviors
	);

	async function onLoad() {
		if (context.globalState.get("onRendering") !== undefined) onRendering = await context.globalState.get("onRendering")!;
		else await context.globalState.update("onRendering", onRendering);

		if (context.globalState.get("behaviors") !== undefined) behaviors = await context.globalState.get("behaviors")!;
		else await context.globalState.update("behaviors", behaviors);

		if (context.globalState.get("onCursorOver") !== undefined) onCursorOver = await context.globalState.get("onCursorOver")!;
		else await context.globalState.update("onCursorOver", onCursorOver);

		if (context.globalState.get("showColon") !== undefined) {
			if (context.globalState.get("showColon")) regexPycurlybraces = /(?<!\\)#(\{|\})/g;
			else regexPycurlybraces = /(?<!\\)#(\{|\})|:\s*\#{/g;
		}
		else { await context.globalState.update("showColon", false); }

		updateDecorations(); //run at vscode startup
	}
	onLoad(); //run at vscode startup
	
}

// this method is called when extension is deactivated
export function deactivate() { }