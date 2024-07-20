import { Plugin, MarkdownPostProcessor } from 'obsidian';
import { EditorView, ViewUpdate, ViewPlugin, DecorationSet, Decoration } from '@codemirror/view';
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
        console.log('DefinitionListPlugin constructed');
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            console.log('Updating decorations');
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        if (!isLivePreview(view)) {
            console.log('Not in Live Preview mode');
            return Decoration.none;
        }

        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;

        let inCodeBlock = false;
        let decorationsAdded = 0;

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

            // Check if the line is part of a blockquote
            const blockquoteMatch = lineText.match(/^(\s*>\s*)/);
            const blockquotePrefix = blockquoteMatch ? blockquoteMatch[1] : '';

            // Remove blockquote prefix for definition matching
            const contentWithoutBlockquote = lineText.slice(blockquotePrefix.length);

            const definitionMatch = contentWithoutBlockquote.match(/^(\s{0,2})([:~])\s/);
            const isPrevLineHeading = prevLine.startsWith('#');
            const isNextLineDefinition = nextLine.slice(blockquotePrefix.length).match(/^(\s{0,2})([:~])\s/);
            const isListItem = contentWithoutBlockquote.match(/^\s*(-|\d+\.)\s/);

            if (definitionMatch && !isPrevLineHeading) {
                builder.add(line.from, line.from, Decoration.line({
                    attributes: { class: "definition-list-dd" }
                }));
                decorationsAdded++;
                console.log(`Added dd decoration to line ${i}: ${lineText}`);
            } else if (isNextLineDefinition && !contentWithoutBlockquote.startsWith('#') && !isListItem) {
                // This is a term (dt) line
                builder.add(line.from, line.from, Decoration.line({
                    attributes: { class: "definition-list-dt" }
                }));
                decorationsAdded++;
                console.log(`Added dt decoration to line ${i}: ${lineText}`);
            }
        }

        console.log(`Total decorations added: ${decorationsAdded}`);
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