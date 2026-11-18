"use client";

import { useState, useTransition } from "react";
import {
  listBrandsAction,
  listLogosAction,
  type BrandOption,
  type CustomerOption,
  type LogoOption,
} from "@/app/(app)/sessions/new/actions";

export type FolderNavInitial = { customer: CustomerOption; brand: BrandOption; logo: LogoOption };

/** Trạng thái đứng ở đâu trong cây Khách hàng > Thương hiệu > Logo, dùng chung cho Trang chính và trang Khách hàng. */
export function useFolderNav(initialCustomers: CustomerOption[], initial: FolderNavInitial | null) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [customer, setCustomer] = useState<CustomerOption | null>(initial?.customer ?? null);
  const [brand, setBrand] = useState<BrandOption | null>(initial?.brand ?? null);
  const [logo, setLogo] = useState<LogoOption | null>(initial?.logo ?? null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [logos, setLogos] = useState<LogoOption[]>([]);
  const [loading, startLoading] = useTransition();

  function openRoot() {
    setCustomer(null);
    setBrand(null);
    setLogo(null);
  }

  function openCustomer(c: CustomerOption) {
    setCustomer(c);
    setBrand(null);
    setLogo(null);
    startLoading(async () => setBrands((await listBrandsAction(c.id)).brands ?? []));
  }

  function openBrand(b: BrandOption) {
    setBrand(b);
    setLogo(null);
    startLoading(async () => setLogos((await listLogosAction(b.id)).logos ?? []));
  }

  /** Nạp lại danh sách ở chỗ đang đứng (sau khi quay lại từ bước khác). */
  function reload() {
    if (brand) startLoading(async () => setLogos((await listLogosAction(brand.id)).logos ?? []));
    else if (customer) startLoading(async () => setBrands((await listBrandsAction(customer.id)).brands ?? []));
  }

  return {
    customers,
    customer,
    brand,
    logo,
    brands,
    logos,
    loading,
    setLogo,
    openRoot,
    openCustomer,
    openBrand,
    reload,
    onCustomerCreated(c: CustomerOption) {
      setCustomers((prev) => [c, ...prev]);
      openCustomer(c);
    },
    onCustomerRenamed(id: string, name: string) {
      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    },
    onCustomerDeleted(id: string) {
      setCustomers((prev) => prev.filter((c) => c.id !== id));
    },
    onBrandRenamed(id: string, name: string) {
      setBrands((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)));
    },
    onBrandDeleted(id: string) {
      setBrands((prev) => prev.filter((b) => b.id !== id));
    },
    onBrandCreated(b: BrandOption) {
      setBrands((prev) => [b, ...prev]);
      openBrand(b);
    },
    onLogoUploaded(l: LogoOption) {
      setLogos((prev) => [l, ...prev]);
      setLogo(l);
    },
  };
}

export type FolderNav = ReturnType<typeof useFolderNav>;
