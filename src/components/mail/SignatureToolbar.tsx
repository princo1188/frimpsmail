import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Image as ImageIcon } from 'lucide-react';

interface SignatureToolbarProps {
  editor: Editor | null;
  onImage: () => void;
}

export default function SignatureToolbar({ editor, onImage }: SignatureToolbarProps) {
  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, icon: ReactNode, title: string) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5 bg-muted/30">
      {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold className="w-4 h-4" />, 'Bold')}
      {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic className="w-4 h-4" />, 'Italic')}
      {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <List className="w-4 h-4" />, 'Bullet list')}
      {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="w-4 h-4" />, 'Numbered list')}
      {btn(editor.isActive('link'), () => {
        const url = window.prompt('Enter link URL');
        if (url) editor.chain().focus().setLink({ href: url }).run();
      }, <LinkIcon className="w-4 h-4" />, 'Link')}
      {btn(false, onImage, <ImageIcon className="w-4 h-4" />, 'Insert image')}
    </div>
  );
}
