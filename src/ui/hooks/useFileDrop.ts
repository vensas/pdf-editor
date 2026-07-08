/**
 * Window-level drag & drop of files. Shows a drop indicator while dragging
 * files anywhere over the app and hands the dropped files to the callback.
 */

import { useEffect, useRef, useState } from 'react';

export function useFileDrop(onFiles: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onFiles);
  handler.current = onFiles;

  useEffect(() => {
    const hasFiles = (event: DragEvent): boolean =>
      [...(event.dataTransfer?.types ?? [])].includes('Files');

    const onDragEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };
    const onDragLeave = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length > 0) handler.current(files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return dragging;
}
