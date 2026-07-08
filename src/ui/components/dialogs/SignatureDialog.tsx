/**
 * Signature dialog: draw with the pointer (mouse/touch/pen) or upload an
 * image. The drawing is rasterized to a transparent PNG locally and placed
 * on the active page as a regular image annotation.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { placeImage, placeImageFromFile } from '../../../services/place-image';
import { useToasts } from '../../toast/Toasts';
import { Modal } from '../Modal';

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 220;
const STROKE_WIDTH = 2.6;

export function SignatureDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [color, setColor] = useState('#1a2030');
  const fileRef = useRef<HTMLInputElement>(null);
  const toasts = useToasts();

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = CANVAS_WIDTH * ratio;
    canvas.height = CANVAS_HEIGHT * ratio;
    context.scale(ratio, ratio);
    context.lineWidth = STROKE_WIDTH;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    setHasStrokes(false);
  }, [open]);

  const pointerPosition = useCallback((event: React.PointerEvent): { x: number; y: number } => {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * CANVAS_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * CANVAS_HEIGHT,
    };
  }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    setHasStrokes(false);
  }, []);

  const place = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      try {
        if (!blob) throw new Error('Could not read the signature.');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        await placeImage(bytes, 'image/png');
        toasts.push('success', 'Signature placed — drag it into position.');
        onClose();
      } catch (error) {
        toasts.push('error', error instanceof Error ? error.message : 'Something went wrong.');
      }
    }, 'image/png');
  }, [onClose, toasts]);

  return (
    <Modal title="Add signature" open={open} onClose={onClose}>
      <div className="signature-pad-wrap">
        <canvas
          ref={canvasRef}
          className="signature-pad"
          style={{ width: '100%', aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
          aria-label="Signature drawing area"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const context = canvasRef.current?.getContext('2d');
            if (!context) return;
            drawing.current = true;
            const { x, y } = pointerPosition(event);
            context.strokeStyle = color;
            context.beginPath();
            context.moveTo(x, y);
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            const context = canvasRef.current?.getContext('2d');
            if (!context) return;
            const { x, y } = pointerPosition(event);
            context.lineTo(x, y);
            context.stroke();
            setHasStrokes(true);
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
      </div>
      <div className="field-row signature-controls">
        <label className="field-inline">
          <span>Ink</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <button type="button" className="link-button" onClick={clear} disabled={!hasStrokes}>
          Clear
        </button>
        <button type="button" className="link-button" onClick={() => fileRef.current?.click()}>
          Upload image instead…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void placeImageFromFile(file)
              .then(() => {
                toasts.push('success', 'Signature image placed — drag it into position.');
                onClose();
              })
              .catch((error: unknown) =>
                toasts.push(
                  'error',
                  error instanceof Error ? error.message : 'Something went wrong.',
                ),
              );
          }}
        />
      </div>
      <p className="muted small">Drawn right here, stored only in this tab — never uploaded.</p>
      <div className="modal-actions">
        <button type="button" className="tool-button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="tool-button is-primary"
          disabled={!hasStrokes}
          onClick={place}
        >
          Place on page
        </button>
      </div>
    </Modal>
  );
}
