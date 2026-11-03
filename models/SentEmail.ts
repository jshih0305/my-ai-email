import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

// 每次寄信的紀錄：寄件資訊 + 當次晨報的完整資料
const SentEmailSchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    status: { type: String, enum: ["sent", "failed"], required: true },
    resendId: { type: String },
    error: { type: String },

    briefDate: { type: String, required: true, index: true }, // YYYY-MM-DD
    weather: { type: Schema.Types.Mixed },
    stock: { type: Schema.Types.Mixed },
    news: { type: [Schema.Types.Mixed], default: [] },
    summary: { type: Schema.Types.Mixed },
    briefErrors: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: "sent_emails" },
);

export type SentEmail = InferSchemaType<typeof SentEmailSchema>;

export const SentEmailModel: Model<SentEmail> =
  (mongoose.models.SentEmail as Model<SentEmail>) ??
  mongoose.model<SentEmail>("SentEmail", SentEmailSchema);
