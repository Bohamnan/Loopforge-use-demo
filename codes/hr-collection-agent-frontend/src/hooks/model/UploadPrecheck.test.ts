import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, pickSingleFile, precheckFile } from './UploadPrecheck';

function fileOf(name: string, size: number, type: string): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('UploadPrecheck.precheckFile', () => {
  it('has a 10 MB limit of 10485760 bytes', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10_485_760);
  });

  it.each([
    ['a.pdf', 'application/pdf'],
    ['a.PDF', 'application/pdf'],
    ['a.jpg', 'image/jpeg'],
    ['a.JPEG', 'image/jpeg'],
    ['a.png', 'image/png'],
    ['photo.Png', ''],
  ])('accepts %s (%s)', (name, type) => {
    expect(precheckFile(fileOf(name, 1000, type))).toEqual({ ok: true });
  });

  it.each([
    ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['a.txt', 'text/plain'],
    ['noext', ''],
    ['a.pdf', 'text/plain'],
    ['a.gif', 'image/gif'],
  ])('rejects unsupported type %s (%s)', (name, type) => {
    const result = precheckFile(fileOf(name, 1000, type));
    expect(result).toMatchObject({ ok: false, reason: 'unsupported_type' });
    expect(result.ok === false && result.message).toBe('仅支持 PDF、JPG、JPEG、PNG 格式。');
  });

  it('accepts exactly 10 MB and rejects one byte more', () => {
    expect(precheckFile(fileOf('a.pdf', MAX_UPLOAD_BYTES, 'application/pdf'))).toEqual({ ok: true });
    const result = precheckFile(fileOf('a.pdf', MAX_UPLOAD_BYTES + 1, 'application/pdf'));
    expect(result).toMatchObject({ ok: false, reason: 'too_large' });
    expect(result.ok === false && result.message).toBe('文件超过 10 MB，请压缩后重试。');
  });

  it('rejects an empty file', () => {
    const result = precheckFile(fileOf('a.pdf', 0, 'application/pdf'));
    expect(result).toMatchObject({ ok: false, reason: 'empty' });
    expect(result.ok === false && result.message).toBe('文件内容为空，请重新选择。');
  });
});

describe('UploadPrecheck.pickSingleFile', () => {
  it('returns the only file', () => {
    const f = fileOf('a.pdf', 10, 'application/pdf');
    expect(pickSingleFile([f])).toEqual({ file: f, multiple: false });
  });

  it('takes the first file and flags multiple selection', () => {
    const a = fileOf('a.pdf', 10, 'application/pdf');
    const b = fileOf('b.pdf', 10, 'application/pdf');
    expect(pickSingleFile([a, b])).toEqual({ file: a, multiple: true });
  });

  it('returns no file for an empty selection', () => {
    expect(pickSingleFile([])).toEqual({ file: null, multiple: false });
  });
});
