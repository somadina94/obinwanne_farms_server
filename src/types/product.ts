import type { Document, Types } from "mongoose";

export type ProductType = "digital" | "physical";

export interface IDigitalAsset {
  fileId: string;
  fileName: string;
  bucketId: string;
  contentType: string;
}

export interface IProduct extends Document {
  title: string;
  slug: string;
  description: string;
  type: ProductType;
  priceNgn: number;
  images: string[];
  primaryImageIndex?: number;
  stock: number | null;
  digitalAsset?: IDigitalAsset | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProductId = Types.ObjectId | string;
