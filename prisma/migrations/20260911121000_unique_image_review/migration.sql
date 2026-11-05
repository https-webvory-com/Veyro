DROP INDEX "ImageReview_shop_mediaId_idx";
CREATE UNIQUE INDEX "ImageReview_shop_mediaId_key" ON "ImageReview"("shop", "mediaId");
