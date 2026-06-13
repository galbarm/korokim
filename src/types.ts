import { CompanyTypes } from 'israeli-bank-scrapers'

export interface Account {
  company: CompanyTypes
  username?: string
  password: string
  id?: string
  card6Digits?: string
  num?: string
  userCode?: string
  pingUrl?: string
  skipInGHA?: boolean
}
