# Sets `last_modified_at` on pages and posts so that
#   - jekyll-sitemap writes an accurate <lastmod>, and
#   - post JSON-LD / article:modified_time get a real dateModified.
#
# Rules (front matter `last_modified_at` always wins if set by hand):
#   - lastmod_from_build: true (chart pages fed by daily data, see _config.yml defaults)
#       → build time. Deploys are triggered by the data-update workflows.
#   - everything else → date of the last git commit that touched the file.
#     Posts never go earlier than their own `date`.
#
# Needs full git history in CI (actions/checkout `fetch-depth: 0` in deploy.yml); with a
# shallow clone every file would get the same date. Any failure only logs a warning — it
# must never break the site build.
require "open3"
require "time"

Jekyll::Hooks.register :site, :post_read do |site|
  begin
    out, status = Open3.capture2(
      "git", "-c", "core.quotepath=off", "log", "--format=@@%cI", "--name-only",
      chdir: site.source
    )
    last_commit = {}
    if status.success?
      current = nil
      out.each_line do |line|
        line = line.strip
        next if line.empty?
        if line.start_with?("@@")
          current = Time.parse(line[2..])
        else
          last_commit[line] ||= current # git log is newest-first
        end
      end
    else
      Jekyll.logger.warn "last_modified:", "git log failed; <lastmod> falls back to defaults"
    end

    (site.pages + site.posts.docs).each do |doc|
      next if doc.data["last_modified_at"]
      if doc.data["lastmod_from_build"]
        doc.data["last_modified_at"] = site.time
        next
      end
      git_time = last_commit[doc.relative_path.sub(%r{\A/}, "")]
      next unless git_time
      if doc.respond_to?(:date) && doc.data["date"].is_a?(Time) && git_time < doc.data["date"]
        git_time = doc.data["date"]
      end
      doc.data["last_modified_at"] = git_time
    end
  rescue StandardError => e
    Jekyll.logger.warn "last_modified:", "skipped (#{e.class}: #{e.message})"
  end
end
