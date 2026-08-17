import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Outdent, Indent, Link, Image, Smile, Quote, RemoveFormatting,
  Type, Highlighter, ChevronDown
} from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface RichTextToolbarProps {
  editor: Editor | null;
  onInlineImage: () => void;
}

const FONT_FAMILIES = [
  { label: 'Sans Serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Monospace', value: 'monospace' },
];

const FONT_SIZES = [
  { label: 'Small', value: '12px' },
  { label: 'Normal', value: '16px' },
  { label: 'Large', value: '20px' },
  { label: 'Huge', value: '28px' },
];

const COMMON_EMOJIS = ['😀', '😂', '😍', '👍', '👎', '🔥', '❤️', '🎉', '✅', '⚠️', '❓', '💡', '📎', '📅', '🚀'];

export default function RichTextToolbar({ editor, onInlineImage }: RichTextToolbarProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [textColor, setTextColor] = useState('#000000');
  const [highlightColor, setHighlightColor] = useState('#FFFF00');
  const colorInputRef = useRef<HTMLInputElement>(null);
  const highlightInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const setLink = () => {
    if (!linkUrl) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    setLinkUrl('');
    setLinkOpen(false);
  };

  const addEmoji = (emoji: string) => {
    editor.chain().focus().insertContent(emoji).run();
    setEmojiOpen(false);
  };

  const currentFont = editor.getAttributes('textStyle').fontFamily ?? 'sans-serif';
  const currentSize = editor.getAttributes('textStyle').fontSize ?? '16px';

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-border bg-muted/20">
      {/* Text style */}
      <Toggle
        size="sm" aria-label="Bold"
        pressed={editor.isActive('bold')}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="w-4 h-4" />
      </Toggle>
      <Toggle
        size="sm" aria-label="Italic"
        pressed={editor.isActive('italic')}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="w-4 h-4" />
      </Toggle>
      <Toggle
        size="sm" aria-label="Underline"
        pressed={editor.isActive('underline')}
        onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="w-4 h-4" />
      </Toggle>
      <Toggle
        size="sm" aria-label="Strikethrough"
        pressed={editor.isActive('strike')}
        onPressedChange={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="w-4 h-4" />
      </Toggle>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Font family */}
      <Select value={currentFont} onValueChange={(value) => editor.chain().focus().setFontFamily(value).run()}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <Type className="w-3 h-3 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map(f => (
            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font size */}
      <Select value={currentSize} onValueChange={(value) => editor.chain().focus().setFontSize(value).run()}>
        <SelectTrigger className="h-8 w-[90px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map(s => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Text color */}
      <div className="relative">
        <button
          onClick={() => colorInputRef.current?.click()}
          className="h-8 px-2 rounded-md hover:bg-muted flex items-center gap-1 text-xs"
          title="Text color"
        >
          <span className="font-semibold" style={{ color: textColor }}>A</span>
          <ChevronDown className="w-3 h-3" />
        </button>
        <input
          ref={colorInputRef}
          type="color"
          value={textColor}
          onChange={(e) => {
            setTextColor(e.target.value);
            editor.chain().focus().setColor(e.target.value).run();
          }}
          className="absolute inset-0 opacity-0 w-0 h-0"
        />
      </div>

      {/* Highlight */}
      <div className="relative">
        <button
          onClick={() => highlightInputRef.current?.click()}
          className="h-8 px-2 rounded-md hover:bg-muted flex items-center gap-1 text-xs"
          title="Highlight color"
        >
          <Highlighter className="w-4 h-4" style={{ color: highlightColor }} />
          <ChevronDown className="w-3 h-3" />
        </button>
        <input
          ref={highlightInputRef}
          type="color"
          value={highlightColor}
          onChange={(e) => {
            setHighlightColor(e.target.value);
            editor.chain().focus().toggleHighlight({ color: e.target.value }).run();
          }}
          className="absolute inset-0 opacity-0 w-0 h-0"
        />
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Alignment */}
      <Toggle size="sm" pressed={editor.isActive({ textAlign: 'left' })} onPressedChange={() => editor.chain().focus().setTextAlign('left').run()}>
        <AlignLeft className="w-4 h-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive({ textAlign: 'center' })} onPressedChange={() => editor.chain().focus().setTextAlign('center').run()}>
        <AlignCenter className="w-4 h-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive({ textAlign: 'right' })} onPressedChange={() => editor.chain().focus().setTextAlign('right').run()}>
        <AlignRight className="w-4 h-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive({ textAlign: 'justify' })} onPressedChange={() => editor.chain().focus().setTextAlign('justify').run()}>
        <AlignJustify className="w-4 h-4" />
      </Toggle>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Lists */}
      <Toggle size="sm" pressed={editor.isActive('bulletList')} onPressedChange={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="w-4 h-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive('orderedList')} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="w-4 h-4" />
      </Toggle>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().liftListItem('listItem').run()} title="Outdent">
        <Outdent className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().sinkListItem('listItem').run()} title="Indent">
        <Indent className="w-4 h-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Link */}
      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-8 w-8', editor.isActive('link') && 'text-primary')} title="Insert link">
            <Link className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-2" align="start">
          <p className="text-xs font-medium">Insert link</p>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full text-sm px-2 py-1 border rounded-md"
            onKeyDown={(e) => { if (e.key === 'Enter') setLink(); }}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={setLink}>Add</Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Emoji */}
      <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Insert emoji">
            <Smile className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <div className="grid grid-cols-5 gap-1">
            {COMMON_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => addEmoji(emoji)}
                className="text-lg hover:bg-muted rounded p-1"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Inline image */}
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Insert inline image" onClick={onInlineImage}>
        <Image className="w-4 h-4" />
      </Button>

      {/* Blockquote */}
      <Toggle size="sm" pressed={editor.isActive('blockquote')} onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="w-4 h-4" />
      </Toggle>

      {/* Remove formatting */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Remove formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting className="w-4 h-4" />
      </Button>
    </div>
  );
}
