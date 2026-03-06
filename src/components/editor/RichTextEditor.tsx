
import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { FontSize } from '@/lib/editor-utils'
import { EditorToolbar } from './EditorToolbar'

// Import fonts
import "@fontsource/inter"
import "@fontsource/poppins"
import "@fontsource/roboto-mono"

interface RichTextEditorProps {
    content: string
    onChange: (content: string) => void
    placeholder?: string
}

export const RichTextEditor = ({ content, onChange }: RichTextEditorProps) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            TextStyle,
            Color,
            FontFamily,
            FontSize,
        ],
        content: content,
        onUpdate: ({ editor: updatedEditor }) => {
            onChange(updatedEditor.getHTML())
        },
        editorProps: {
            attributes: {
                class: 'prose prose-invert max-w-none focus:outline-none min-h-[300px] h-full p-8 text-[#E2E8F0] font-sans text-base leading-relaxed',
            },
        },
    })

    // Synchronize content when selected note changes.
    // Avoid calling setContent while the editor is focused to prevent
    // resetting the selection / caret (which causes a vibrating caret).
    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            // Only update external content when the editor is not focused.
            // This prevents a sync loop: parent updates -> prop changes ->
            // setContent() which resets selection while the user types.
            if (!editor.isFocused) {
                editor.commands.setContent(content)
            }
        }
    }, [content, editor])

    return (
        <div className="flex-1 flex flex-col min-h-0 relative">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <EditorContent editor={editor} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 z-10">
                <EditorToolbar editor={editor} />
            </div>
        </div>
    )
}
