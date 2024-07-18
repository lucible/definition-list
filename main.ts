import { Plugin, MarkdownPostProcessor, EditorView } from 'obsidian';
import { ViewUpdate, ViewPlugin, DecorationSet, Decoration, EditorSelection } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

function isLivePreview(view: EditorView): boolean {
    const editorEl = view.dom.closest('.markdown-source-view');
    if (!editorEl) return false;
    return editorEl.classList.contains('is-live-preview');
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

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const lineText = line.text;

            if (i < doc.lines && doc.line(i + 1).text.startsWith(':')) {
                builder.add(line.from, line.to, Decoration.mark({class: "definition-list-dt"}));
            } else if (lineText.startsWith(':')) {
                const colonPos = line.from;
                const spacePos = colonPos + 1;
                const isCursorTouchingColon = this.isCursorTouching(selection, colonPos, spacePos + 1);

                if (!isCursorTouchingColon) {
                    builder.add(colonPos, spacePos + 1, Decoration.replace({class: "definition-list-hidden-colon"}));
                }
                builder.add(line.from, line.to, Decoration.mark({class: "definition-list-dd"}));
            }
        }

        return builder.finish();
    }

    isCursorTouching(selection: EditorSelection, from: number, to: number): boolean {
        for (let range of selection.ranges) {
            if (range.from <= to && range.to >= from) {
                return true;
            }
        }
        return false;
    }
}, {
    decorations: v => v.decorations
});

export default class DefinitionListPlugin extends Plugin {
    async onload() {
        // Register the post processor for reading mode
        this.registerMarkdownPostProcessor(this.definitionListPostProcessor);

        // Register the editor extension
        this.registerEditorExtension(definitionListPlugin);
    }

    definitionListPostProcessor: MarkdownPostProcessor = (element, context) => {
        const paragraphs = element.querySelectorAll("p");

        paragraphs.forEach((paragraph) => {
            const lines = paragraph.innerText.split('\n');

            if (lines.length > 1 && lines[1].startsWith(':')) {
                const dl = document.createElement('dl');

                lines.forEach(line => {
                    if (line.startsWith(':')) {
                        const dd = document.createElement('dd');
                        dd.textContent = line.substring(1).trim();
                        dl.appendChild(dd);
                    } else {
                        const dt = document.createElement('dt');
                        dt.textContent = line.trim();
                        dl.appendChild(dt);
                    }
                });

                paragraph.replaceWith(dl);
            }
        });
    };

    onunload() {
        // Cleanup code if needed
    }
}