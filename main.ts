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
        console.log('Loading DefinitionListPlugin');
        // Register the post processor for reading mode
        this.registerMarkdownPostProcessor(this.definitionListPostProcessor);

        // Register the editor extension for live preview mode
        this.registerEditorExtension(definitionListPlugin);
    }

    // Post-processor for handling definition lists in reading mode
    definitionListPostProcessor: MarkdownPostProcessor = (element, context) => {
        const paragraphs = element.querySelectorAll("p");
    
        paragraphs.forEach((paragraph) => {
            const lines = paragraph.innerHTML.split('<br>');
            let dl: HTMLDListElement | null = null;
            let currentTerm: string | null = null;
            let isDefinitionList = false;
            let skipNextLine = false;
    
            function isNotTerm(line: string): boolean {
                return (
                    line.startsWith('#') || // Heading
                    line.match(/^(-|\*|\+|\d+\.)\s/) !== null || // List item
                    line.startsWith('<img') || // Image
                    line.match(/^(-{3,}|\*{3,}|_{3,})/) !== null || // Horizontal rule
                    line.startsWith('[^') || // Footnote
                    line.startsWith('|') || // Table
                    line.startsWith('$$') || // Math block
                    line.startsWith('^') || // Link reference
                    line.includes('class="footnote-backref footnote-link"') // Footnote backref
                );
            }
    
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
                const definitionMatch = line.match(/^([:~])\s(.+)/);
                const indentedDefinitionMatch = line.match(/^\s{1,2}([:~])\s(.+)/);
    
                if (skipNextLine) {
                    skipNextLine = false;
                    continue;
                }
                
                console.log(line)
                // Check if the current line or the next line is part of a footnote
                if (isNotTerm(line) || isNotTerm(nextLine)) {
                    // If it's a footnote or other non-term content, reset the definition list state
                    isDefinitionList = false;
                    currentTerm = null;
                    continue;
                }
    
                if ((definitionMatch || indentedDefinitionMatch) && (isDefinitionList || currentTerm)) {
                    if (!dl) {
                        dl = document.createElement('dl');
                    }
    
                    if (currentTerm) {
                        const dt = document.createElement('dt');
                        dt.innerHTML = currentTerm;
                        dl.appendChild(dt);
                        currentTerm = null;
                    }
    
                    const dd = document.createElement('dd');
                    dd.innerHTML = (definitionMatch ? definitionMatch[2] : indentedDefinitionMatch![2]);
                    dl.appendChild(dd);
                    isDefinitionList = true;
                } else if ((nextLine.match(/^[:~]\s/) || nextLine.match(/^\s{1,2}[:~]\s/))) {
                    // This line is a term
                    if (currentTerm) {
                        // If there's a previous term, add it to the list
                        if (!dl) {
                            dl = document.createElement('dl');
                        }
                        const dt = document.createElement('dt');
                        dt.innerHTML = currentTerm;
                        dl.appendChild(dt);
                    }
                    currentTerm = line;
                    isDefinitionList = true;
                } else {
                    // End of definition list
                    if (currentTerm) {
                        const dt = document.createElement('dt');
                        dt.innerHTML = currentTerm;
                        dl!.appendChild(dt);
                        currentTerm = null;
                    }
                    isDefinitionList = false;
                }
            }
    
            if (dl && dl.childNodes.length > 0) {
                // Replace the paragraph with the definition list
                paragraph.replaceWith(dl);
            }
        });
    };

    onunload() {
        console.log('Unloading DefinitionListPlugin');
    }
}