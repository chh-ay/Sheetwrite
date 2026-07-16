import { describe, expect, test } from "bun:test";
import { hasOpaqueForeground } from "./canvas-assertions.js";

describe("hasOpaqueForeground", () => {
  test("rejects an untouched transparent-black canvas", () => {
    expect(hasOpaqueForeground(new Uint8ClampedArray(4 * 16))).toBe(false);
  });

  test("rejects fully transparent pixels regardless of their RGB channels", () => {
    expect(hasOpaqueForeground(new Uint8ClampedArray([12, 34, 56, 0, 255, 0, 255, 0]))).toBe(false);
  });

  test("rejects an opaque uniform fill when it matches the background", () => {
    expect(
      hasOpaqueForeground(new Uint8ClampedArray([14, 21, 38, 255, 14, 21, 38, 255]), [14, 21, 38]),
    ).toBe(false);
  });

  test("rejects an implicit uniform opaque background", () => {
    expect(hasOpaqueForeground(new Uint8ClampedArray([14, 21, 38, 255, 14, 21, 38, 255]))).toBe(
      false,
    );
  });

  test("accepts an opaque foreground pixel over the background", () => {
    expect(
      hasOpaqueForeground(
        new Uint8ClampedArray([255, 255, 255, 255, 227, 232, 240, 255]),
        [255, 255, 255],
      ),
    ).toBe(true);
  });

  test("uses the dominant opaque color as the background when none is supplied", () => {
    expect(
      hasOpaqueForeground(
        new Uint8ClampedArray([10, 13, 20, 255, 10, 13, 20, 255, 10, 13, 20, 255, 32, 40, 58, 255]),
      ),
    ).toBe(true);
  });

  test("does not count transparent foreground-colored pixels as paint", () => {
    expect(
      hasOpaqueForeground(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]), [255, 255, 255]),
    ).toBe(false);
  });

  test("does not treat partially transparent pixels as fully opaque paint", () => {
    expect(hasOpaqueForeground(new Uint8ClampedArray([12, 34, 56, 128, 255, 0, 255, 254]))).toBe(
      false,
    );
  });

  test("rejects zero-size input", () => {
    expect(hasOpaqueForeground(new Uint8ClampedArray())).toBe(false);
  });
});
