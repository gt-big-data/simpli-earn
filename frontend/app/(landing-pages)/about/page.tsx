import styles from './about.module.css';
import Image from "next/image";
import { Metadata } from "next";
import { FaLinkedin, FaGithub } from "react-icons/fa";
import Link from 'next/link';

export const metadata: Metadata = {
  title: "About Us | SimpliEarn",
};

const teamMembers = [
  {
    name: "Parth Parikh",
    role: "Project Lead",
    description: "I'm a first-year student studying Computer Science with concentrations in intelligence and theory. I'm passionate about real-world AI/ML applications and I'm interested in delving deeper into academic research. In my free time, I enjoy pursuing photography in parks and nature.",
    image: "/images/team_imgs/Parth_Parikh.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/parthparikh04",
      github: "https://github.com/parthparikh04",
    },
  },
  {
    name: "Vidyut Rajagopal",
    role: "Project Lead",
    description: "I'm a freshman at Georgia Tech and the co-founder of SimpliEarn. I have a strong interest in cybersecurity, cloud computing, and software development. I'm passionate about applying technology to real-world challenges—especially in finance, leadership, and client-facing domains. Outside of SimpliEarn, I enjoy producing music, publishing articles, and playing cricket.",
    image: "/images/team_imgs/Vidyut_Raj_1.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/vidyut-rajagopal",
      github: "https://github.com/vidyutraj",
    },
  },
  {
    name: "Ritwij Ghosh",
    role: "Project Lead",
    description: "I'm a CS major from São Paulo, Brazil with a keen interest in applying machine learning and AI to finance and business use cases.",
    image: "/images/team_imgs/Ritwij_Ghosh.jpeg",
    socials: {
      linkedin: "http://www.linkedin.com/in/ritwij-ghosh",
      github: "https://github.com/ritwij-ghosh",
    },
  },
  {
    name: "Evelyn Chen",
    role: "Data Visualization",
    description: "I'm Evelyn (she/her), from Portland, OR. I love learning new things and enjoy using my creativity and technical programming skills to build full-stack applications. I’m also into rock climbing, hiking, catching sunrises/sunsets, running, crafting (birthday cards are so fun!), and taking too many pics on my digital camera.",
    image: "/images/team_imgs/Evelyn_Chen.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/evelynchen5/",
      github: "https://github.com/itsevelync",
    },
  },
  {
    name: "Neil Samant",
    role: "RAG",
    description: "I'm a mathematics major at Georgia Tech with a concentration in data science and a minor in computer science. I'm passionate about using tech to solve real-world problems—whether that's through building full-stack web apps, diving into machine learning projects, or analyzing data. I'm also a National Master in chess and have been competing for over 10 years.",
    image: "/images/team_imgs/Neil_Samant.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/neil-samant",
      github: "https://github.com/neilsam19",
    },
  },
  {
    name: "Kate Li",
    role: "Data Visualization",
    description: "I'm a computer science major at Georgia Tech with a minor in Linguistics. I love exploring and learning new things, especially when I can use technology to solve real-world problems or chase whatever idea has currently hijacked my brain. I'm also in Film Club and a big foodie—let me know if you have movie or restaurant recommendations!",
    image: "/images/team_imgs/Kate_Li.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/li-kate",
      github: "https://github.com/li-kate",
    },
  },
  {
    name: "Apramey Akkiraju",
    role: "Frontend",
    description: "I'm a computer science student passionate about fintech and the financial services industry. I joined SimpliEarn because its mission of making investing more accessible through earnings call analysis really resonated with me.",
    image: "/images/team_imgs/Apramey_Akkiraju.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/aprameyakkiraju/",
      github: "https://github.com/Apramey006",
    },
  },
  {
    name: "Soham Pati",
    role: "RAG",
    description: "I'm a second-year Computer Science student at Georgia Tech. In my free time, I enjoy golfing and playing the violin.",
    image: "/images/team_imgs/Soham_Pati.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/soham--pati/",
      github: "https://github.com/sohampati",
    },
  },
  {
    name: "Soungmin (Min) Lee",
    role: "Sentiment Analysis",
    description: "I'm a BS/MS student majoring in Computer Science at Georgia Tech. I specialize in NLP and full-stack development, and I'm enthusiastic about building software solutions that solve real-world problems.",
    image: "/images/team_imgs/Soungmin_Lee.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/soung-min-lee/",
      github: "https://github.com/minovermax",
    },
  },
  {
    name: "Ethan Hu",
    role: "Sentiment Analysis",
    description: "I'm a first-year computer science student from the Greater Boston area. I'm interested in numbers, and I enjoy spending time outdoors and baking desserts.",
    image: "/images/team_imgs/Ethan_Hu.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/ethanhu89/",
      github: "https://github.com/ethanhu89",
    },
  },
  {
    name: "Gauri Sharma",
    role: "Sentiment Analysis",
    description: "I'm a Computer Science student at Georgia Tech with a strong interest in Natural Language Processing and finance.",
    image: "/images/team_imgs/Gauri_Sharma.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/gs-softwaredev/",
      github: "https://github.com/gauri-sharmaa",
    },
  },
  {
    name: "Zechariah Frierson",
    role: "Frontend",
    description: "I'm a freshman at Georgia Tech and part of the data visualization team for SimpliEarn. I love frontend web development, web design, and coding in general. Outside of programming, I enjoy playing soccer and volleyball and spending time with friends.",
    image: "/images/team_imgs/Zechariah_Frierson.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/zechariah-frierson/",
      github: "https://github.com/techo10n",
    },
  },
];

export default function AboutUs() {
  return (
    <div className={styles.pageContainer}>
      
      <main className={styles.mainContent}>
        {/* Hero Section */}
        <section className={styles.heroSection}>
          <h1>About Us</h1>
            <p className={styles.heroText}>
              As individuals interested in finance, stock trading, and business, we want to develop a financial education platform that focuses on teaching technical terminology and business acumen through live analysis of quarterly earnings calls.
            </p>
            <p className={styles.heroText}>
              We hope that by using this frequent, real, and low-stakes situation, we can create a safe and productive environment to develop people&apos;s business intuition and financial knowledge.
            </p>
            <p className={styles.heroText}>
              We are under <a href="https://gtbigdatabigimpact.com/" className={styles.orgLink}>Big Data Big Impact</a>, a Georgia Tech Student Organization.
            </p>
        </section>

        {/* Team Section */}
        <section className={styles.teamSection}>
          <h2>Meet the Team</h2>
          <div className={styles.teamGrid}>
            {teamMembers.map((member, index) => (
              <div key={index} className={styles.teamCard}>
                {/* Profile image is currently a square. Might change to circle if preferred */}
                <div className={styles.profileImage}>
                  <Image 
                    src={member.image} 
                    alt={member.name} 
                    width={150}
                    height={150}
                  />
                </div>
                
                {/* Role/tags here instead? */}
                <h3>{member.name}</h3>
                <p className={styles.role}>{member.role}</p>
                <p className={styles.description}>{member.description}</p>
                {/* Social Icons - idk what images to use so there are none rn*/}
                <div className={styles.socialIcons}>
                  {member.socials.linkedin && (
                    <Link href={member.socials.linkedin} target="_blank" rel="noopener noreferrer">
                      <FaLinkedin />
                    </Link>
                  )}
                  {member.socials.github && (
                    <Link href={member.socials.github} target="_blank" rel="noopener noreferrer">
                      <FaGithub />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}