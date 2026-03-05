
import { Editor } from '@tiptap/react'
import {
    Bold,
    Italic
} from 'lucide-react'

interface EditorToolbarProps {
    editor: Editor | null
}

const fonts = [
    { name: 'Inter', value: '"Inter", sans-serif' },
    { name: 'Poppins', value: '"Poppins", sans-serif' },
    { name: 'Roboto Mono', value: '"Roboto Mono", monospace' },
    { name: 'System', value: 'system-ui' },
]

const fontSizes = [
    '12px', '14px', '16px', '18px', '20px', '24px', '32px'
]

const colors = [
    { name: 'Default', value: 'inherit' },
    { name: 'Purple', value: '#A78BFA' },
    { name: 'Blue', value: '#60A5FA' },
    { name: 'Green', value: '#34D399' },
    { name: 'Red', value: '#F87171' },
    { name: 'Yellow', value: '#FBBF24' },
]

export const EditorToolbar = ({ editor }: EditorToolbarProps) => {
    if (!editor) return null

    return (
        <div className="flex items-center gap-2 p-2 bg-[#1A1A24]/80 backdrop-blur-md border border-[#2A2A3A] rounded-2xl shadow-2xl mx-4 mb-4">
            {/* Font Family Dropdown */}
            <div className="flex items-center border-r border-[#2A2A3A] pr-2 gap-1">
                <select
                    className="bg-transparent text-[10px] font-bold text-[#E2E8F0] focus:outline-none cursor-pointer p-1 rounded hover:bg-[#2A2A3A]"
                    onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
                    value={editor.getAttributes('textStyle').fontFamily || '"Inter", sans-serif'}
                >
                    {fonts.map(f => (
                        <option key={f.value} value={f.value} className="bg-[#1A1A24] text-[#E2E8F0]">{f.name}</option>
                    ))}
                </select>
            </div>

            {/* Font Size Dropdown */}
            <div className="flex items-center border-r border-[#2A2A3A] pr-2 gap-1">
                <select
                    className="bg-transparent text-[10px] font-bold text-[#E2E8F0] focus:outline-none cursor-pointer p-1 rounded hover:bg-[#2A2A3A]"
                    onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
                    value={editor.getAttributes('textStyle').fontSize || '16px'}
                >
                    {fontSizes.map(size => (
                        <option key={size} value={size} className="bg-[#1A1A24] text-[#E2E8F0]">{size}</option>
                    ))}
                </select>
            </div>

            {/* Basic Formatting */}
            <div className="flex items-center border-r border-[#2A2A3A] pr-2 gap-1">
                <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`p-1.5 rounded transition-colors ${editor.isActive('bold') ? 'bg-[#A78BFA] text-[#0F0F13]' : 'text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#2A2A3A]'}`}
                >
                    <Bold className="h-4 w-4" />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`p-1.5 rounded transition-colors ${editor.isActive('italic') ? 'bg-[#A78BFA] text-[#0F0F13]' : 'text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#2A2A3A]'}`}
                >
                    <Italic className="h-4 w-4" />
                </button>
            </div>

            {/* Color Picker */}
            <div className="flex items-center gap-1">
                <div className="flex gap-1 px-1">
                    {colors.map(color => (
                        <button
                            key={color.value}
                            onClick={() => editor.chain().focus().setColor(color.value).run()}
                            className={`w-4 h-4 rounded-full border border-[#2A2A3A] hover:scale-125 transition-transform ${editor.isActive('textStyle', { color: color.value }) ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0F0F13]' : ''}`}
                            style={{ backgroundColor: color.value === 'inherit' ? '#E2E8F0' : color.value }}
                            title={color.name}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
