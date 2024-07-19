import { Plugin, MarkdownPostProcessor, EditorView } from 'obsidian';
import { ViewUpdate, ViewPlugin, DecorationSet, Decoration, EditorSelection } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

// Helper function to check if the editor is in Live Preview mode
function isLivePreview(view: EditorView): boolean {
    const editorEl = view.dom.closest('.markdown-source-view');
    return editorEl?.classList.contains('is-live-preview') ?? false;
}

// ViewPlugin for handling decorations in the editor (Live Preview)
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

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const lineText = line.text;

            // Check for code block delimiters
            if (lineText.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }

            if (inCodeBlock) {
                continue;  // Skip processing if we're inside a code block
            }

            const prevLine = i > 1 ? doc.line(i - 1).text : '';
            const nextLine = i < doc.lines ? doc.line(i + 1).text : '';

            const definitionMatch = lineText.match(/^(\s{0,2})([:~])\s/);
            const isPrevLineHeading = prevLine.startsWith('#');
            const isNextLineDefinition = nextLine.match(/^(\s{0,2})([:~])\s/);
            const isListItem = lineText.match(/^\s*(-|\d+\.)\s/);
            const isPrevLineListItem = prevLine.match(/^\s*(-|\d+\.)\s/);

            if (definitionMatch && !isPrevLineHeading && !isPrevLineListItem) {
                const [fullMatch, indent, marker] = definitionMatch;
                const isIndented = indent.length > 0;
                const indentStartPos = line.from;
                const indentEndPos = line.from + indent.length;
                const markerStartPos = indentEndPos;
                const markerEndPos = line.from + fullMatch.length;

                const isCursorTouchingIndent = this.isCursorTouching(selection, indentStartPos, indentEndPos);
                const isCursorBetweenIndentAndMarker = this.isCursorTouching(selection, indentEndPos, markerStartPos);
                const isCursorTouchingMarker = this.isCursorTouching(selection, markerStartPos, markerEndPos);

                if (isIndented) {
                    if (isCursorTouchingIndent || isCursorBetweenIndentAndMarker || isCursorTouchingMarker) {
                        // Apply dd-margin to indent spaces
                        builder.add(indentStartPos, indentEndPos, Decoration.mark({class: "definition-list-dd-margin"}));
                    }

                    if (isCursorTouchingIndent || isCursorBetweenIndentAndMarker || isCursorTouchingMarker) {
                        // Apply dd-content to marker
                        builder.add(markerStartPos, markerEndPos, Decoration.mark({class: "definition-list-dd-content"}));
                    } else {
                        // Hide marker if cursor is not touching or between
                        builder.add(markerStartPos, markerEndPos, Decoration.mark({class: "definition-list-hidden-marker"}));
                        // Add margin to first visible content after marker
                        builder.add(markerEndPos, markerEndPos + 1, Decoration.mark({class: "definition-list-dd-margin"}));
                    }
                } else {
                    // Non-indented definition handling
                    if (isCursorTouchingMarker) {
                        builder.add(markerStartPos, markerEndPos, Decoration.mark({class: "definition-list-dd-margin"}));
                    } else {
                        builder.add(markerStartPos, markerEndPos, Decoration.mark({class: "definition-list-hidden-marker"}));
                        builder.add(markerEndPos, markerEndPos + 1, Decoration.mark({class: "definition-list-dd-margin"}));
                    }
                }
                
                // Mark the rest of the definition (dd) line content
                if (markerEndPos < line.to) {
                    builder.add(markerEndPos, line.to, Decoration.mark({class: "definition-list-dd-content"}));
                }
            } else if (isNextLineDefinition && !lineText.startsWith('#') && !isListItem) {
                // This is a term (dt) line
                builder.add(line.from, line.to, Decoration.mark({class: "definition-list-dt"}));
            }
        }

        return builder.finish();
    }

    isCursorTouching(selection: EditorSelection, from: number, to: number): boolean {
        return selection.ranges.some(range => range.from <= to && range.to >= from);
    }
}, {
    decorations: v => v.decorations
});

// ... rest of the plugin code remains the same

export default class DefinitionListPlugin extends Plugin {
    async onload() {
        console.log('Loading DefinitionListPlugin');
        // Register the post processor for reading mode
        this.registerMarkdownPostProcessor(this.definitionListPostProcessor);

        // Register the editor extension for live preview mode
        this.registerEditorExtension(definitionListPlugin);
    }

    definitionListPostProcessor: MarkdownPostProcessor = (element, context) => {
        console.log('Processing markdown for definition lists');
        const paragraphs = element.querySelectorAll("p");

        paragraphs.forEach((paragraph) => {
            const lines = paragraph.innerHTML.split('<br>');
            let dl: HTMLDListElement | null = null;
            let currentTerm: string | null = null;
            let isDefinitionList = false;
            let skipNextLine = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
                const definitionMatch = line.match(/^([:~])\s(.+)/);
                const indentedDefinitionMatch = line.match(/^\s{1,2}([:~])\s(.+)/);

                if (skipNextLine) {
                    skipNextLine = false;
                    continue;
                }

                if ((definitionMatch || indentedDefinitionMatch) && isDefinitionList) {
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
                } else if ((nextLine.match(/^[:~]\s/) || nextLine.match(/^\s{1,2}[:~]\s/)) && !line.match(/^#+\s/)) {
                    // This line is a term, but not if it's a heading
                    if (currentTerm) {
                        // If there's a previous term, add it to the list
                        const dt = document.createElement('dt');
                        dt.innerHTML = currentTerm;
                        dl!.appendChild(dt);
                    }
                    currentTerm = line;
                    isDefinitionList = true;
                } else if (isDefinitionList) {
                    // End of definition list
                    if (currentTerm) {
                        const dt = document.createElement('dt');
                        dt.innerHTML = currentTerm;
                        dl!.appendChild(dt);
                        currentTerm = null;
                    }
                    isDefinitionList = false;
                } else if (line.match(/^#+\s/)) {
                    // If it's a heading, skip the next line to avoid parsing it as a definition
                    skipNextLine = true;
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