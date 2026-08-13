export interface Deal {
  publisher: string;
  name: string;
  price: string;
  discountPercent: number;
  url: string;
  owned: boolean;
  /** Set after detail-page wishlist check; undefined until checked */
  onWishlist?: boolean;
}

export interface ScrapePageResult {
  deals: Deal[];
  ownedCount: number;
  hasNextPage: boolean;
}
