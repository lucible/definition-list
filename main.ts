import { Plugin, MarkdownPostProcessor } from 'obsidian';
import { EditorView, ViewUpdate, ViewPlugin, DecorationSet, Decoration } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const definitionListPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        console.log('DefinitionListPlugin: Initializing view plugin');
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            console.log('DefinitionListPlugin: Updating decorations');
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        console.log('DefinitionListPlugin: Building decorations');
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const lineText = line.text;

            if (i < doc.lines && doc.line(i + 1).text.startsWith(':')) {
                console.log(`DefinitionListPlugin: Found term at line ${i}: ${lineText}`);
                builder.add(line.from, line.to, Decoration.mark({class: "definition-list-dt"}));
            } else if (lineText.startsWith(':')) {
                console.log(`DefinitionListPlugin: Found definition at line ${i}: ${lineText}`);
                builder.add(line.from, line.to, Decoration.mark({class: "definition-list-dd"}));
            }
        }

        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

export default class DefinitionListPlugin extends Plugin {
    async onload() {
        console.log('DefinitionListPlugin: Plugin loaded');

        // Register the post processor for reading mode
        this.registerMarkdownPostProcessor(this.definitionListPostProcessor);
        console.log('DefinitionListPlugin: Markdown post-processor registered');

        // Register the editor extension for live preview mode
        this.registerEditorExtension(definitionListPlugin);
        console.log('DefinitionListPlugin: Editor extension registered');
    }

    definitionListPostProcessor: MarkdownPostProcessor = (element, context) => {
        console.log('DefinitionListPlugin: Post-processing markdown');
        const paragraphs = element.querySelectorAll("p");

        paragraphs.forEach((paragraph, index) => {
            const lines = paragraph.innerText.split('\n');

            if (lines.length > 1 && lines[1].startsWith(':')) {
                console.log(`DefinitionListPlugin: Found definition list in paragraph ${index + 1}`);
                const dl = document.createElement('dl');

                lines.forEach(line => {
                    if (line.startsWith(':')) {
                        const dd = document.createElement('dd');
                        dd.textContent = line.substring(1).trim();
                        dl.appendChild(dd);
                        console.log(`DefinitionListPlugin: Added definition: ${dd.textContent}`);
                    } else {
                        const dt = document.createElement('dt');
                        dt.textContent = line.trim();
                        dl.appendChild(dt);
                        console.log(`DefinitionListPlugin: Added term: ${dt.textContent}`);
                    }
                });

                paragraph.replaceWith(dl);
                console.log('DefinitionListPlugin: Replaced paragraph with definition list');
            }
        });
    };

    onunload() {
        console.log('DefinitionListPlugin: Plugin unloaded');
    }
}