---
layout: post
title:  "Jekyll Configuration: Part 1"
date:   2015-03-14 17:25:14
categories: jekyll setup
---
This is my first time setting up a Jekyll site, and I figured it would probably be a good idea to start documenting it from the beginning. Well mostly the beginning. As of writing this, it's already been installed I've pushed up a basic commit to my Github Pages site.

The first thing I did was start to play with the layout. Although visually appealling, I wasn't crazy about the default layout, so the first thing I did was install [Bootstrap][bootstrap] by modifying `_includes/head.html` and [adding in a link to a CDN hosted version][bootstrap-cdn].

I'm not going to go into too much detail about creating the layout or writing the code, as most is trivial code, but I will mention some of the things I saw as non-standard and took more than a few seconds of thought to implement. Eventually I will be scrapping all of the default layout and building my own, but until I have a set idea I'm going to build piece by piece.

Next, I decided I wanted to change the social media icons at the bottom of the page. After some searching, I found some ones hosted by [dreamstale (thanks!)][dreamstale]. Since the way the icons were currently set up, I couldn't easily implement these into the layout, so I did a Google search and found a post by [David Ensinger][davidensinger] that basically gave me a hint on how to do it. The first step I took towards this was adding my social media settings to `_config.yml`. I modified the layout of the usernames section to be something like this:

{% highlight yaml %}
social:
  - site: Github
    username: ginoclement
    url: https://github.com/
  - site: Linkedin
    username: ginoclement
    url: https://linkedin.com/in/
  - site: Twitter
    username: ginoclement
    url: https://twitter.com/
{% endhighlight %}

This gave me a format where I could automatically include icon links to any of the sites I wanted. The second part in implementing was modifying `_includes/footer.html` which contained the existing code, and injecting my code to load these new values. I used a loop in Liquid over the each of the sites, which in turn generated the HTML for each image.

{% highlight liquid linenos %}
<ul class="social-media-list list-inline">
  {% raw %}{% for social in site.social %}{% endraw %}
    <li>
      {% raw %}<a href="{{social.url}}{{social.username}}">{% endraw %}
        {% raw %}<img src="{{ social.site  | downcase 
                                  | prepend: '/assets/icons/' 
                                  | append: '.png' }}" 
             alt="{{ social.site }}" />{% endraw %}
      </a>
    </li>
  {% raw %}{% endfor %}{% endraw %}
</ul>
{% endhighlight %}

I broke up the `img` tag onto multiple lines to try and make the liquid code look a little cleaner and readable in the example. Essentially what is happening here is it's taking the URL from the site and making it all lowercase. It then prepends the path to the icons, `/assets/icons/` and appends the file type `.png`. 

[bootstrap]:      http://getbootstrap.com/
[bootstrap-cdn]:  http://getbootstrap.com/getting-started/#download-cdn
[dreamstale]:     http://www.dreamstale.com/free-download-72-vector-social-media-icons/
[davidensinger]:  http://davidensinger.com/2014/11/how-to-dynamically-include-svgs-inline-with-jekyll/ 
