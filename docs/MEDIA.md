# Media library

## Upload and describe an image

1. Open **Media** in the workspace and select **Upload image**.
2. Choose one still JPEG, PNG or WebP. Maximum input: 10 MiB, 24 megapixels, 8192 pixels on either side. Animated images, SVG, documents and video are unsupported.
3. In **Image details**, give the image a useful title. Add alternative text describing what matters in the picture; leave it empty only when the image is decorative. Add a caption if useful, then save.

Images are oriented automatically, resized within 2560 × 2560 without enlargement, and saved as WebP with original metadata removed. The original file is not retained. The library has a 256 MiB / 1000-image limit, measured after conversion. Storage usage is displayed below the grid.

Search matches titles and alternative text. Larger libraries have previous/next pages. Selecting an image opens its details and shows how many saved drafts, published entries and retained versions use it. Closing an image with unsaved metadata asks before discarding those edits. If another tab changes the image, a save conflict preserves your local text; copy it if necessary, reload details, and merge deliberately.

## Add it to a page or post

1. Open the visual editor and drag **Library image** from Content onto the canvas.
2. Select the block, choose **Choose image**, and select an image. You can also upload directly in this picker.
3. Adjust alternative text and caption for this particular page. Library defaults are copied at selection time; later library edits do not change existing page text.
4. **Save draft**, preview the saved draft, then **Publish** when ready.

An unselected Library image block can be saved as a draft but prevents publishing. Use **Replace image** to change the selection. **Remove image** clears the selection; remove the whole block or choose another image before publishing again. The original **Image URL** block remains available for unmanaged external images.

## Privacy and deletion

New uploads and images used only by drafts require the owner session. Anonymous access begins when a published page or post references the image. Unpublishing revokes anonymous access unless another published entry still uses it. Previously downloaded copies cannot be recalled.

**Delete image** is disabled while a saved draft, a published entry or a retained version uses the image. Remove or replace it in every saved draft, and publish those changes or unpublish the relevant entries. Removing an image only from a draft does not remove its published reference. Older saved versions keep their images available for restoration; those references expire as new versions replace them under the [history retention limit](REVISIONS.md#what-is-kept). There is no manual history cleanup control yet. Deletion is permanent and asks for confirmation.

Unsaved editor selections are not references yet. If an image is deleted in another tab before you save the page, the save fails and your editor content remains available so you can choose a replacement.

## Running your own site

The database and `DATA_DIR/media` must be backed up together while the server is stopped. Do not serve the media directory directly through a proxy/static server: doing so bypasses publication privacy. The current adapter supports one server process and local persistent disk. See [operations](OPERATIONS.md), [API contracts](API.md#media-api) and [ADR 0002](decisions/0002-media-library.md).

Object storage, responsive image variants, original-file downloads, cropping, image replacement in place and bulk actions are future work. This module does not change the project's pre-alpha status or remove the security, backup/restore and load-testing release gates.
