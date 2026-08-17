import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import LinkExt from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import FontSize from '@tiptap/extension-font-size';
import ResizableImage from './ResizableImage';
import RichTextToolbar from './RichTextToolbar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface RichTextEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** Maximum width in pixels for images inserted in this editor. */
  maxImageWidth?: number;
  /** Upload handler for inline images; should return the public URL. */
  onInlineImageUpload?: (file: File) => Promise<string>;
}

export default function RichTextEditor({
  content = '',
  onChange,
  placeholder = 'Write something…',
  className,
  maxImageWidth = Infinity,
  onInlineImageUpload,
}: RichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      LinkExt.configure({ openOnClick: false, autolink: true }),
      ResizableImage.configure({ allowBase64: false, maxWidth: maxImageWidth }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FontSize,
    ],
    content,
    onUpdate({ editor: ed }) {
      onChange?.(ed.getHTML());
    },
  });

  const handleInlineImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor || !onInlineImageUpload) return;
    setUploadingImage(true);
    try {
      const url = await onInlineImageUpload(file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (err) {
      toast.error('Failed to insert image');
      console.error(err);
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  return (
    <div className={cn('border border-border rounded-md overflow-hidden bg-background flex flex-col', className)}>
      <RichTextToolbar
        editor={editor}
        onInlineImage={() => imageInputRef.current?.click()}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        className="hidden"
        onChange={handleInlineImage}
      />
      <div className="tiptap-editor min-h-[140px] p-3">
        <EditorContent editor={editor} />
      </div>
      {uploadingImage && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-2 bg-muted/30">
          <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Uploading image…
        </div>
      )}
    </div>
  );
}
