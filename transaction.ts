import mongoose from 'mongoose'
const { Schema, model } = mongoose


export interface ITransaction extends Document{
  _id: string,
  account: string,  
  id: string,
  status: string,
  date: Date,
  amount: number,
  description: string,
  memo: string,
  sentMail: boolean
}

const TransactionSchema = new Schema<ITransaction>({
    _id: String,
    account: String,  
    id: String,
    status: String,
    date: Date,
    amount: Number,
    description: String,
    memo: String,
    sentMail: {
      type: Boolean,
      index: true
    }
  },
  { versionKey: false })

  const Transaction = model<ITransaction>('Transaction', TransactionSchema)

  export default Transaction