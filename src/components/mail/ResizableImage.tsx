import { useRef, useState, useCallback, useEffect } from 'react';
import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';

function ResizableImageComponent(props: NodeViewProps & { maxWidth?: number }) {
  const { node, updateAttributes, selected } = props;
  const maxWidth = props.maxWidth ?? Infinity;
  const imgRef = useRef<HTMLImageElement>(null);

  const parseDim = (value: unknown) => {
    if (value === null || value === undefined || value === 'auto') return 0;
    const n = parseInt(String(value), 10);
    return Number.isNaN(n) ? 0 : n;
  };

  const initialW = parseDim(node.attrs.width);
  const initialH = parseDim(node.attrs.height);

  const [dims, setDims] = useState({ width: initialW || undefined, height: initialH || undefined });
  const startRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Once the image loads, apply a sensible cap if dimensions are missing.
  const onImageLoad = useCallback(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    let w = dims.width ?? img.naturalWidth;
    let h = dims.height ?? img.naturalHeight;
    if (w > maxWidth) {
      h = Math.round((h * maxWidth) / w);
      w = maxWidth;
    }
    if (w === dims.width && h === dims.height) return;
    setDims({ width: w, height: h });
    updateAttributes({ width: w, height: h });
  }, [maxWidth]); // eslint-disable-line

  useEffect(() => {
    if (imgRef.current?.complete) onImageLoad();
  }, [onImageLoad]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const baseW = dims.width ?? imgRef.current?.naturalWidth ?? 100;
    const baseH = dims.height ?? imgRef.current?.naturalHeight ?? 100;
    startRef.current = { x: e.clientX, y: e.clientY, w: baseW, h: baseH };
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
  };

  const onResize = useCallback((e: MouseEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    let newW = startRef.current.w + dx;
    if (newW > maxWidth) newW = maxWidth;
    if (newW < 30) newW = 30;
    const ratio = startRef.current.w / startRef.current.h;
    const newH = Math.round(newW / ratio);
    setDims({ width: newW, height: newH });
  }, [maxWidth]);

  const stopResize = useCallback(() => {
    if (startRef.current) {
      updateAttributes({ width: dims.width, height: dims.height });
    }
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
    startRef.current = null;
  }, [dims, onResize, updateAttributes]);

  const { src, alt, title } = node.attrs;

  return (
    <NodeViewWrapper
      as="span"
      className="relative inline-block"
      style={{ display: 'inline-block', lineHeight: 0, verticalAlign: 'text-bottom' }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt ?? ''}
        title={title ?? ''}
        width={dims.width}
        height={dims.height}
        onLoad={onImageLoad}
        style={{
          width: dims.width ? `${dims.width}px` : 'auto',
          height: dims.height ? `${dims.height}px` : 'auto',
          maxWidth: '100%',
          display: 'inline-block',
        }}
        className={selected ? 'ring-2 ring-primary ring-offset-1' : ''}
      />
      {selected && (
        <span
          role="button"
          aria-label="Resize image"
          onMouseDown={startResize}
          className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full cursor-se-resize ring-2 ring-background"
        />
      )}
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export default Image.extend<{ allowBase64?: boolean; maxWidth?: number }>({
  name: 'image',
  addOptions() {
    return {
      ...(this.parent?.() as object ?? {}),
      maxWidth: Infinity,
    };
  },

  addAttributes() {
    return {
      ...(this.parent?.() as object ?? {}),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width'),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute('height'),
        renderHTML: (attrs) => (attrs.height ? { height: attrs.height } : {}),
      },
    };
  },

  addNodeView() {
    const maxWidth = this.options.maxWidth as number | undefined;
    return ReactNodeViewRenderer((props: NodeViewProps) => (
      <ResizableImageComponent {...props} maxWidth={maxWidth} />
    ));
  },
});
