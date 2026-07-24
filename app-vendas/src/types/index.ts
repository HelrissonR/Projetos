export interface CustomFieldDef {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean'
}

export interface PaymentMethod {
  id: string
  label: string
  enabled: boolean
}

export interface Settings {
  id?: string
  company_name: string
  logo_url: string | null
  currency: string
  locale: string
  brand_color: string // "R G B"
  theme: 'light' | 'dark'
  payment_methods: PaymentMethod[]
  product_custom_fields: CustomFieldDef[]
  low_stock_threshold: number
}

export interface Category {
  id: string
  name: string
  created_at?: string
}

export interface Product {
  id: string
  name: string
  sku: string | null
  category_id: string | null
  price: number
  cost: number | null
  stock: number
  active: boolean
  image: string | null
  custom: Record<string, unknown>
  created_at?: string
}

export interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  document: string | null
  address: string | null
  notes: string | null
  created_at?: string
}

export interface SaleItem {
  id?: string
  sale_id?: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface Sale {
  id: string
  customer_id: string | null
  customer_name: string | null
  total: number
  discount: number
  payment_method: string
  status: 'completed' | 'canceled'
  created_at: string
  items?: SaleItem[]
}

export interface CartLine {
  product: Product
  quantity: number
}
