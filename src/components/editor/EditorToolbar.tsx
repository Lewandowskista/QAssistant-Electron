
import { Editor } from '@tiptap/react'
import {
    Bold,
    Italic,
    Strikethrough,
    Underline
} from 'lucide-react'

interface EditorToolbarProps {
    editor: Editor | null
}

const fonts = [
    { name: 'Inter', value: '"Inter", sans-serif' },
    { name: 'Roboto Mono', value: '"Roboto Mono", monospace' },
    { name: 'System', value: 'system-ui' },
]

const fontSizes = [
    '12px', '14px', '16px', '18px', '20px', '24px', '32px'
]

const colors = [
    { name: 'Default', value: 'inherit' },
    { name: 'Cyan', value: '#22D3EE' },
    { name: 'Blue', value: '#60A5FA' },
    { name: 'Green', value: '#34D399' },
    { name: 'Red', value: '#F87171' },
    { name: 'Yellow', value: '#FBBF24' },
]

export const EditorToolbar = ({ editor }: EditorToolbarProps) => {
    if (!editor) return null

    return (
        <div className="flex items-center gap-2 p-2 bg-surface-alt/80 backdrop-blur-md border border-ui rounded-2xl shadow-2xl mx-4 mb-4">
            {/* Font Family Dropdown */}
            <div className="flex items-center border-r border-ui pr-2 gap-1">
                <select
                    aria-label="Font family"
                    className="bg-transparent text-[11px] font-bold text-foreground focus:outline-none cursor-pointer p-1 rounded hover:bg-elevated"
                    onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
                    value={editor.getAttributes('textStyle').fontFamily || '"Inter", sans-serif'}
                >
                    {fonts.map(f => (
                        <option key={f.value} value={f.value} className="bg-panel-muted text-foreground">{f.name}</option>
                    ))}
                </select>
            </div>

            {/* Font Size Dropdown */}
            <div className="flex items-center border-r border-ui pr-2 gap-1">
                <select
                    aria-label="Font size"
                    className="bg-transparent text-[11px] font-bold text-foreground focus:outline-none cursor-pointer p-1 rounded hover:bg-elevated"
                    onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
                    value={editor.getAttributes('textStyle').fontSize || '16px'}
                >
                    {fontSizes.map(size => (
                        <option key={size} value={size} className="bg-panel-muted text-foreground">{size}</option>
                    ))}
                </select>
            </div>

            {/* Basic Formatting */}
            <div className="flex items-center border-r border-ui pr-2 gap-1">
                <button
                    type="button"
                    aria-label="Bold"
                    aria-pressed={editor.isActive('bold')}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`p-1.5 rounded transition-colors ${editor.isActive('bold') ? 'bg-primary text-primary-foreground' : 'text-muted-ui hover:text-foreground hover:bg-elevated'}`}
                >
                    <Bold className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    aria-label="Italic"
                    aria-pressed={editor.isActive('italic')}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`p-1.5 rounded transition-colors ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : 'text-muted-ui hover:text-foreground hover:bg-elevated'}`}
                >
                    <Italic className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    aria-label="Underline"
                    aria-pressed={editor.isActive('underline')}
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={`p-1.5 rounded transition-colors ${editor.isActive('underline') ? 'bg-primary text-primary-foreground' : 'text-muted-ui hover:text-foreground hover:bg-elevated'}`}
                >
                    <Underline className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    aria-label="Strikethrough"
                    aria-pressed={editor.isActive('strike')}
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    className={`p-1.5 rounded transition-colors ${editor.isActive('strike') ? 'bg-primary text-primary-foreground' : 'text-muted-ui hover:text-foreground hover:bg-elevated'}`}
                >
                    <Strikethrough className="h-4 w-4" />
                </button>
            </div>

            {/* Color Picker */}
            <div className="flex items-center gap-1">
                <div className="flex gap-1 px-1">
                    {colors.map(color => (
                        <button
                            key={color.value}
                            type="button"
                            aria-label={`Text color: ${color.name}`}
                            aria-pressed={editor.isActive('textStyle', { color: color.value })}
                            onClick={() => editor.chain().focus().setColor(color.value).run()}
                            className={`w-4 h-4 rounded-full border border-ui hover:scale-125 transition-transform ${editor.isActive('textStyle', { color: color.value }) ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-app' : ''}`}
                            style={{ backgroundColor: color.value === 'inherit' ? '#E2E8F0' : color.value }}
                            title={color.name}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
