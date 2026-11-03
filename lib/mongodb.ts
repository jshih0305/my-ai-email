import mongoose from "mongoose";

// 開發模式熱重載會重新執行模組，把連線存在 global 避免重複建立連線
const g = globalThis as typeof globalThis & {
  _mongoose?: Promise<typeof mongoose>;
};

export function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("缺少 MONGODB_URI");

  if (!g._mongoose) {
    g._mongoose = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 10000 })
      .catch((e) => {
        g._mongoose = undefined; // 連線失敗下次重試
        throw e;
      });
  }
  return g._mongoose;
}
