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
        let lastTermLine = -1;
        let lastLineWasHeading = false;
        let lastLineWasList = false;

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const lineText = line.text;

            if (lineText.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }

            if (inCodeBlock) continue;

            const blockquoteMatch = lineText.match(/^(\s*>\s*)/);
            const blockquotePrefix = blockquoteMatch ? blockquoteMatch[1] : '';
            const contentWithoutBlockquote = lineText.slice(blockquotePrefix.length);

            const definitionMatch = contentWithoutBlockquote.match(/^(\s{0,2})([:~])\s/);
            const isHeading = contentWithoutBlockquote.startsWith('#');
            const isListItem = contentWithoutBlockquote.match(/^\s*(-|\d+\.)\s/);
            const nextLine = i < doc.lines ? doc.line(i + 1).text : '';
            const isNextLineDefinition = nextLine.slice(blockquotePrefix.length).match(/^(\s{0,2})([:~])\s/);

            if (isHeading) {
                lastLineWasHeading = true;
                lastLineWasList = false;
            } else if (isListItem) {
                lastLineWasList = true;
                lastLineWasHeading = false;
            } else if (definitionMatch && !lastLineWasHeading && !lastLineWasList) {
                // Add line decoration for the whole definition
                builder.add(line.from, line.from, Decoration.line({
                    attributes: { class: "definition-list-dd" }
                }));

                // Add mark decoration for the definition mark
                const [fullMatch, indent, marker] = definitionMatch;
                const markerStartPos = line.from + blockquotePrefix.length + indent.length;
                const markerEndPos = markerStartPos + marker.length + 1; // +1 for the space after the marker

                const isCursorTouchingMarker = selection.ranges.some(range => 
                    range.from <= markerEndPos && range.to >= markerStartPos
                );

                if (isCursorTouchingMarker) {
                    builder.add(markerStartPos, markerEndPos, Decoration.mark({
                        attributes: { class: "definition-list-visible-marker" }
                    }));
                } else {
                    builder.add(markerStartPos, markerEndPos, Decoration.mark({
                        attributes: { class: "definition-list-hidden-marker" }
                    }));
                }

                // Update lastTermLine if this is not an indented definition
                if (indent.length === 0) {
                    lastTermLine = i - 1;
                }
            } else if ((isNextLineDefinition || i === lastTermLine + 1) && !isHeading && !isListItem) {
                // This is a term (dt) line
                builder.add(line.from, line.from, Decoration.line({
                    attributes: { class: "definition-list-dt" }
                }));
                lastTermLine = i;
            }

            // Reset flags if the current line is not a heading or list item
            if (!isHeading && !isListItem) {
                lastLineWasHeading = false;
                lastLineWasList = false;
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