---
layout: post
title:  "Jekyll Configuration: Part 2"
date:   2015-03-15 10:25:14
categories: jekyll setup
---

Now that this is my second post, and the site is now pushed up to Github Pages, it's time to configure DNS. This was pretty straight forward and took me less than five minutes using the instructions from [Github][github]. The first thing I did was log into my registrar and configure the IP address for the domain. Github provides two:

{% highlight text %}
192.30.252.153
192.30.252.154
{% endhighlight %}

I was able to add both since my registrar provided a load balancing option where I could set more than one option.

The next step was to create a `CNAME` file at the root of my room, the contents were just my domain name, `ginoclement.com`. Within a minute, the DNS changes had updated and I was able to access the Github Pages site using `ginoclement.com`.

[github]:      https://help.github.com/articles/tips-for-configuring-an-a-record-with-your-dns-provider/
