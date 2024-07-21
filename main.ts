import { Plugin, MarkdownPostProcessor } from 'obsidian';
import { EditorView, ViewUpdate, ViewPlugin, DecorationSet, Decoration } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

function isLivePreview(view: EditorView): boolean {
    const editorEl = view.dom.closest('.markdown-source-view');
    return editorEl?.classList.contains('is-live-preview') ?? false;
}

const definitionListPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        if (!isLivePreview(view)) {
            return Decoration.none;
        }
    
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const selection = view.state.selection;
    
        let inCodeBlock = false;
        let lastLineWasTerm = false;
        let lastLineWasDefinition = false;
    
        function isNotTerm(content: string): boolean {
            return (
                content.match(/^#+\s/) !== null || // Heading
                content.match(/^\s*(-|\d+\.)\s/) !== null || // List item
                content.startsWith('![') || // Image
                content.match(/^(-{3,}|\*{3,}|_{3,})/) !== null || // Horizontal rule
                content.startsWith('[^') || // Footnote
                content.startsWith('|') || // Table
                content.startsWith('$$') || // Math block
                content.startsWith('^') // Link reference
            );
        }
    
        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const lineText = line.text;
            const trimmedLineText = lineText.trim();
    
            if (trimmedLineText.startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                lastLineWasTerm = false;
                lastLineWasDefinition = false;
                continue;
            }
    
            if (inCodeBlock) {
                lastLineWasTerm = false;
                lastLineWasDefinition = false;
                continue;
            }
    
            const definitionMatch = lineText.match(/^(\s*)([:~])\s/);
            const nextLine = i < doc.lines ? doc.line(i + 1).text : '';
            const isNextLineDefinition = nextLine.trim().match(/^(\s{0,2})([:~])\s/);
    
            if (trimmedLineText === '') {
                // Reset the state when encountering a blank line
                lastLineWasTerm = false;
                lastLineWasDefinition = false;
            } else if (definitionMatch && (lastLineWasTerm || lastLineWasDefinition)) {
                const [fullMatch, indent, marker] = definitionMatch;
                const isIndented = indent.length > 0;
    
                // Add line decoration for the whole definition
                builder.add(line.from, line.from, Decoration.line({
                    attributes: { class: isIndented ? "definition-list-dd-indented" : "definition-list-dd-reg" }
                }));
    
                // Add mark decoration for the indentation + definition mark
                const indentStartPos = line.from;
                const markerEndPos = indentStartPos + indent.length + marker.length + 1;
    
                const isCursorTouchingIndentOrMarker = selection.ranges.some(range => 
                    range.from <= markerEndPos && range.to >= indentStartPos
                );
    
                if (isCursorTouchingIndentOrMarker) {
                    builder.add(indentStartPos, markerEndPos, Decoration.mark({
                        attributes: { class: "definition-list-visible-marker" }
                    }));
                } else {
                    builder.add(indentStartPos, markerEndPos, Decoration.mark({
                        attributes: { class: "definition-list-hidden-marker" }
                    }));
                }
    
                lastLineWasDefinition = true;
                lastLineWasTerm = false;
            } else if (isNextLineDefinition && !isNotTerm(trimmedLineText)) {
                // This is a term (dt) line
                builder.add(line.from, line.from, Decoration.line({
                    attributes: { class: "definition-list-dt" }
                }));
                lastLineWasTerm = true;
                lastLineWasDefinition = false;
            } else {
                lastLineWasTerm = false;
                lastLineWasDefinition = false;
            }
        }
    
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

export default class DefinitionListPlugin extends Plugin {
    async onload() {
        // Register the post processor for reading mode
        this.registerMarkdownPostProcessor(this.definitionListPostProcessor);

        // Register the editor extension for live preview mode
        this.registerEditorExtension(definitionListPlugin);
    }

    // Post-processor for handling definition lists in reading mode
    definitionListPostProcessor: MarkdownPostProcessor = (element, context) => {
        function isNotTerm(content: string): boolean {
            return (
                content.match(/^#+\s/) !== null || // Heading
                content.match(/^\s*(-|\d+\.)\s/) !== null || // List item
                content.startsWith('>') || // Blockquote
                content.startsWith('<img') || // Image
                content.match(/^(-{3,}|\*{3,}|_{3,})/) !== null || // Horizontal rule
                content.startsWith('[^') || // Footnote
                content.includes('class="footnote-backref footnote-link"') || // Footnote backref
                content.startsWith('|') || // Table
                content.startsWith('$$') || // Math block
                content.startsWith('^') // Link reference
            );
        }
    
        const paragraphs = element.querySelectorAll("p");
    
        paragraphs.forEach((paragraph, paragraphIndex) => {
            const lines = paragraph.innerHTML.split('<br>');
            let dl: HTMLDListElement | null = null;
            let currentTerm: string | null = null;
            let newContent: (HTMLElement | string)[] = [];
            let invalidateCurrentPair = false;
    
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
                const definitionMatch = line.match(/^(\s*)([:~])\s(.+)/);
                const isNextLineDefinition = nextLine.match(/^(\s*)([:~])\s(.+)/);
    
    
                if (definitionMatch && !invalidateCurrentPair) {
                    if (definitionMatch[3].includes('class="footnote-backref footnote-link"')) {
                        invalidateCurrentPair = true;
                    }
                    
                    if (currentTerm && !invalidateCurrentPair) {
                        if (!dl) {
                            dl = document.createElement('dl');
                            newContent.push(dl);
                            const dt = document.createElement('dt');
                            dt.innerHTML = currentTerm;
                            dl.appendChild(dt);
                        }
                        const dd = document.createElement('dd');
                        dd.innerHTML = definitionMatch[3];
                        dl.appendChild(dd);
                    } else {
                        if (currentTerm) {
                            newContent.push(currentTerm + '<br>');
                        }
                        newContent.push(line + '<br>');
                        currentTerm = null;
                        invalidateCurrentPair = false;
                    }
                } else if (isNextLineDefinition && !isNotTerm(line) && !invalidateCurrentPair) {
                    if (currentTerm) {
                        newContent.push(currentTerm + '<br>');
                    }
                    currentTerm = line;
                    dl = null;
                } else {
                    if (currentTerm) {
                        newContent.push(currentTerm + '<br>');
                        currentTerm = null;
                    }
                    newContent.push(line + '<br>');
                    dl = null;
                    invalidateCurrentPair = false;
                }
    
            }

            paragraph.innerHTML = '';
            newContent.forEach(content => {
                if (typeof content === 'string') {
                    paragraph.innerHTML += content;
                } else {
                    paragraph.appendChild(content);
                }
            });
    
        });
    };

    onunload() {
        // Placeholder
    }
}