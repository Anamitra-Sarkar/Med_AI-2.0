declare module "next-pwa" {
  import type { NextConfig } from "next";

  type WithPWA = (config?: NextConfig) => NextConfig;

  export default function createPWA(options?: Record<string, unknown>): WithPWA;
}
