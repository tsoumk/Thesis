<?php

include_once 'config.php';
include_once 'functions.php';

$start = 0;
$end =  630;

$prefix = 'https://www.tripadvisor.com.gr';
$num = 'g189430';
$loc = 'Mykonos_Cyclades_South_Aegean';
$addr = 'ΜΥΚΟΝΟΣ';

for($page = $start; $page < $end; $page+=30){

    file_put_contents('.progress', $page);
    $url = $prefix."/Hotels-$num-oa$page-$loc-Hotels.html";
    $names = getNodes($url, "//a[contains(@class, 'property_title')]");
    $prices = getNodes($url, "//div[contains(@class, 'price-wrap')]");
    $reviews_count = getNodes($url, "//a[contains(@class, 'review_count')]");
    $reviews = getNodes($url, "//a[contains(@class, 'ui_bubble_rating')]");

    foreach($names as $k=>$item){
        $name = trim($item->nodeValue);
        $link = $item->getAttribute('href');

        if ( !entityExists($db, 'hotels', 'name', $name) ){
            if ( isset($prices[$k]) ){
                $price = (int) str_replace('€', '', $prices[$k]->nodeValue);
            } else{
                $price = 0;
            }

            if ( isset($reviews[$k]) ){
                $alt = $reviews[$k]->getAttribute('alt');
                $rating = floatval(str_replace(',', '.', substr($alt, 0, strpos($alt, ' ')))) * 2;
            } else{
                $rating = 1;
            }

            if ( isset($reviews_count[$k]) ){
                $count = str_replace('κριτικές', '', $reviews_count[$k]->nodeValue);
            } else{
                $count = rand(1, 100);
            }

            #LOCATION
            if ( !empty($link) ){
                $location1 = getNodes($prefix.$link, "//span[contains(@class, 'street-address')]");
                $address = '';
                if ( !empty($location1) && !empty($location1->item(0)) ){
                    $address = $location1->item(0)->nodeValue ?? '';
                }
                $location2 = getNodes($prefix.$link, "//span[contains(@class, 'locality')]");
                if ( !empty($location2) && !empty($location2->item(0)) ){
                    $address .= ' '.$location2->item(0)->nodeValue ?? '';
                }
                #echo '<br>'.$address;
            }
            $address .= ' '.$addr;

            $sql = "INSERT INTO hotels(`name`, `price`, `reviews_count`, `rating`, `location`)VALUES(:name, :price, :reviews_count, :rating, :location)";
            $stmt = $db->prepare($sql);
            $stmt->bindParam(':name', $name);
            $stmt->bindParam(':price', $price);
            $stmt->bindParam(':reviews_count', $count);
            $stmt->bindParam(':rating', $rating);
            $stmt->bindParam(':location', $address);
            $stmt->execute();
        }

        #echo '<br>'.$name.' | '.$price.' | '.$rating.' | '.$count;
    }
    #echo '<br>'.$url;
}