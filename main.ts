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

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const lineText = line.text;

            // Check if the previous line is not a heading
            const prevLine = i > 1 ? doc.line(i - 1).text : '';
            const isPrevLineHeading = prevLine.startsWith('#');

            if (i < doc.lines && (doc.line(i + 1).text.startsWith(': ') || doc.line(i + 1).text.startsWith('~ '))) {
                // Mark the term (dt) line
                builder.add(line.from, line.to, Decoration.mark({class: "definition-list-dt"}));
            } else if ((lineText.startsWith(': ') || lineText.startsWith('~ ')) && !isPrevLineHeading) {
                const markerPos = line.from;
                const isCursorTouchingMarker = this.isCursorTouching(selection, markerPos, markerPos + 2);

                if (isCursorTouchingMarker) {
                    // Apply dd-margin to the marker when cursor is touching it
                    builder.add(markerPos, markerPos + 2, Decoration.mark({class: "definition-list-dd-margin"}));
                } else {
                    // Hide the marker if cursor is not touching it
                    builder.add(markerPos, markerPos + 2, Decoration.mark({class: "definition-list-hidden-marker"}));
                    
                    // Find the first non-space character after the marker
                    const contentStart = lineText.slice(2).search(/\S/) + 2;
                    
                    // Add margin to the first visible content after the marker
                    builder.add(line.from + contentStart, line.from + contentStart + 1, Decoration.mark({class: "definition-list-dd-margin"}));
                }
                
                // Mark the rest of the definition (dd) line content
                const contentStart = lineText.slice(2).search(/\S/) + 2;
                if (contentStart + 1 < lineText.length) {
                    builder.add(line.from + contentStart + 1, line.to, Decoration.mark({class: "definition-list-dd-content"}));
                }
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