
import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { FontSize } from '@/lib/editor-utils'
import { EditorToolbar } from './EditorToolbar'


interface RichTextEditorProps {
    content: string
    onChange: (content: string) => void
    placeholder?: string
}

export const RichTextEditor = ({ content, onChange }: RichTextEditorProps) => {
    // Track the last HTML value emitted by onUpdate so we can distinguish
    // "the parent reflected our own change back" from "the parent sent genuinely
    // new content (e.g. note switched)".  Only call setContent when the incoming
    // prop is truly different from what we last emitted, which breaks the
    // update loop without relying on the fragile editor.isFocused check.
    const lastEmittedRef = useRef<string>(content)

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
            const html = updatedEditor.getHTML()
            lastEmittedRef.current = html
            onChange(html)
        },
        editorProps: {
            attributes: {
                class: 'prose prose-invert max-w-none focus:outline-none min-h-[300px] h-full p-8 text-[#E2E8F0] font-sans text-base leading-relaxed',
            },
        },
    })

    useEffect(() => {
        if (!editor) return
        // Only push content into the editor when the prop carries a value that
        // did not originate from our own last keystroke.  This prevents the
        // circular-update that resets the caret position while the user types.
        if (content !== lastEmittedRef.current) {
            lastEmittedRef.current = content
            editor.commands.setContent(content)
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
